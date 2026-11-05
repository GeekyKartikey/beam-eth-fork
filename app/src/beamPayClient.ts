/**
 * @file Device-side BeamPay access: account reads (cap, linked human), call
 * encoding, sending through the Privy embedded wallet, and revert decoding.
 *
 * Sends use a wallet client with `retryCount: 0` and explicit gas and fees, so
 * a payment is never retried or re-estimated by the wallet.
 */
import type { PrivyEmbeddedWalletProvider } from '@privy-io/expo';
import {
  BaseError,
  createWalletClient,
  custom,
  decodeErrorResult,
  encodeFunctionData,
  toHex,
  zeroHash,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { publicClient } from './chain';
import { chain, NETWORK } from './config';
import type { Intent } from './intent';
import { BEAM_PAY_ABI, toSourceApp } from './beamPay';
import { isRecord } from './storage';

const RECEIPT_TIMEOUT_MS = 60_000;

/** BeamPay state of one account. */
export type BeamPayAccount = {
  /** `capFor(account)`: largest payment without a World ID approval. */
  cap: bigint;
  /** A World ID human is bound (`humanOf != 0`). */
  linked: boolean;
};

/** A World ID approval signature for one BeamPay call. */
export type Approval = { signature: Hex; deadline: number };

/**
 * Reads an account's cap and World ID link.
 * @param beamPay BeamPay deployment.
 * @param account Wallet address.
 * @returns Cap and link state.
 * @throws When the RPC is unreachable.
 */
export async function readAccount(beamPay: Address, account: Address): Promise<BeamPayAccount> {
  const [cap, human] = await Promise.all([
    publicClient.readContract({ address: beamPay, abi: BEAM_PAY_ABI, functionName: 'capFor', args: [account] }),
    publicClient.readContract({ address: beamPay, abi: BEAM_PAY_ABI, functionName: 'humanOf', args: [account] }),
  ]);
  return { cap, linked: human !== zeroHash };
}

/**
 * Calldata for a payment: `pay`, or `payWithApproval` when an approval is given.
 * @param intent The intent being paid.
 * @param approval World ID approval for `payWithApproval`, or null for `pay`.
 * @returns Calldata for BeamPay.
 */
export function paymentData(intent: Intent, approval: Approval | null): Hex {
  const sourceApp = toSourceApp(intent.provenance.appLabel ?? '');
  return approval
    ? encodeFunctionData({
        abi: BEAM_PAY_ABI,
        functionName: 'payWithApproval',
        args: [intent.to, intent.intentHash, sourceApp, BigInt(approval.deadline), approval.signature],
      })
    : encodeFunctionData({ abi: BEAM_PAY_ABI, functionName: 'pay', args: [intent.to, intent.intentHash, sourceApp] });
}

/** Account-level BeamPay calls sent from Profile. */
export type AccountCall =
  | { kind: 'lowerCap'; cap: bigint }
  | { kind: 'raiseCap'; cap: bigint; approval: Approval }
  | { kind: 'linkHuman'; humanHash: Hex; approval: Approval };

/**
 * Calldata for an account-level call.
 * @param call The call.
 * @returns Calldata for BeamPay.
 */
function accountData(call: AccountCall): Hex {
  switch (call.kind) {
    case 'lowerCap':
      return encodeFunctionData({ abi: BEAM_PAY_ABI, functionName: 'lowerCap', args: [call.cap] });
    case 'raiseCap':
      return encodeFunctionData({
        abi: BEAM_PAY_ABI,
        functionName: 'raiseCap',
        args: [call.cap, BigInt(call.approval.deadline), call.approval.signature],
      });
    case 'linkHuman':
      return encodeFunctionData({
        abi: BEAM_PAY_ABI,
        functionName: 'linkHuman',
        args: [call.humanHash, BigInt(call.approval.deadline), call.approval.signature],
      });
  }
}

/** User-facing copy for each BeamPay custom error. */
const REVERT_COPY: Record<string, string> = {
  OverCap: 'Over your per-payment cap. It needs a World ID approval.',
  Expired: 'Approval expired. Try again.',
  BadSignature: 'This approval is no longer valid. Approve again.',
  NotLinked: 'Link World ID in Profile to approve this.',
  TransferFailed: 'The recipient rejected this payment. Nothing was sent.',
  InvalidCap: "That cap isn't allowed.",
  ZeroAddress: 'This payment is malformed. Ask again.',
  ZeroAmount: 'This payment is malformed. Ask again.',
};

/**
 * Decodes an BeamPay custom error anywhere in a viem error chain.
 * @param e Anything thrown by a call, estimate or send.
 * @returns The error name (e.g. "BadSignature"), or null when none decodes.
 */
function beamPayErrorName(e: unknown): string | null {
  if (!(e instanceof BaseError)) return null;
  let name: string | null = null;
  e.walk((err) => {
    const d: unknown = (err as { data?: unknown }).data;
    const hex = typeof d === 'string' ? d : isRecord(d) && typeof d.data === 'string' ? d.data : null;
    if (hex && /^0x[0-9a-fA-F]{8}/.test(hex)) {
      try {
        name = decodeErrorResult({ abi: BEAM_PAY_ABI, data: hex as Hex }).errorName;
      } catch {
        // Not an BeamPay error; keep walking.
      }
    }
    return name !== null;
  });
  return name;
}

/**
 * Plain-language copy for an BeamPay revert.
 * @param name Decoded error name, or null.
 * @returns Copy, or null when the error is not an BeamPay revert.
 */
const revertCopy = (name: string | null): string | null => (name ? (REVERT_COPY[name] ?? null) : null);

/**
 * One-line, length-capped error text for anything thrown.
 * @param e Anything thrown.
 * @returns BeamPay revert copy, viem's `shortMessage`, or the first line of the message.
 */
export function shortError(e: unknown): string {
  const reverted = revertCopy(beamPayErrorName(e));
  if (reverted) return reverted;
  const short = (e as { shortMessage?: unknown } | null)?.shortMessage;
  const text = typeof short === 'string' ? short : e instanceof Error ? e.message : '';
  return text.split('\n')[0].slice(0, 120) || 'Something went wrong.';
}

/** A wallet client over the Privy provider. */
type BeamWalletClient = ReturnType<typeof walletClientFor>;

/**
 * Wallet client over the Privy provider. `retryCount: 0` so a send is never retried.
 * @param provider Privy embedded wallet EIP-1193 provider.
 * @returns A viem wallet client pinned to `NETWORK`.
 */
export const walletClientFor = (provider: PrivyEmbeddedWalletProvider) =>
  createWalletClient({ chain, transport: custom(provider, { retryCount: 0 }) });

/**
 * Makes sure the wallet is on `NETWORK`, switching if needed.
 * @param client Wallet client.
 * @returns True when the wallet ends up on `NETWORK.chainId`.
 */
export async function ensureChain(client: BeamWalletClient): Promise<boolean> {
  try {
    if ((await client.getChainId()) === NETWORK.chainId) return true;
    await client.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: toHex(NETWORK.chainId) }] });
    return (await client.getChainId()) === NETWORK.chainId;
  } catch {
    return false;
  }
}

/** A fully specified BeamPay transaction. */
export type BeamPayTx = { account: Address; beamPay: Address; data: Hex; value: bigint };

/**
 * Dry-runs an BeamPay transaction against the latest state (or a past block).
 * @param tx The transaction.
 * @param blockNumber Block to replay at (to explain a mined revert); latest when omitted.
 * @returns Revert copy, or null when the call succeeds.
 * @throws When the RPC is unreachable (not a revert).
 */
export async function simulateBeamPay(tx: BeamPayTx, blockNumber?: bigint): Promise<string | null> {
  try {
    await publicClient.call({ account: tx.account, to: tx.beamPay, data: tx.data, value: tx.value, blockNumber });
    return null;
  } catch (e) {
    const name = beamPayErrorName(e);
    if (name) return revertCopy(name) ?? 'BeamPay rejected this transaction.';
    throw e;
  }
}

/**
 * Signs and sends an BeamPay transaction once. Never retried.
 * @param client Wallet client on `NETWORK`.
 * @param tx The transaction.
 * @param gas Gas limit.
 * @param maxFeePerGas Max fee per gas.
 * @returns The transaction hash.
 */
export function sendBeamPay(client: BeamWalletClient, tx: BeamPayTx, gas: bigint, maxFeePerGas: bigint): Promise<Hash> {
  return client.sendTransaction({ account: tx.account, to: tx.beamPay, data: tx.data, value: tx.value, gas, maxFeePerGas });
}

/**
 * Explains a mined revert by replaying the transaction at its block.
 * @param tx The reverted transaction.
 * @param blockNumber Block it was mined in.
 * @returns Revert copy, or a generic line when it can't be decoded.
 */
export async function explainRevert(tx: BeamPayTx, blockNumber: bigint): Promise<string> {
  return (await simulateBeamPay(tx, blockNumber).catch(() => null)) ?? 'Transaction reverted. Nothing was sent.';
}

/**
 * Sends an account-level call (lower or raise the cap, link World ID) and waits for it.
 * Gas is estimated here, which also surfaces BeamPay reverts before signing.
 * @param provider Privy embedded wallet provider.
 * @param beamPay BeamPay deployment.
 * @param account Wallet address.
 * @param call The call.
 * @returns Resolves once the transaction succeeds.
 * @throws Error whose message is user-facing copy.
 */
export async function sendAccountCall(
  provider: PrivyEmbeddedWalletProvider,
  beamPay: Address,
  account: Address,
  call: AccountCall,
): Promise<void> {
  const client = walletClientFor(provider);
  if (!(await ensureChain(client))) throw new Error(`Couldn't switch your wallet to ${NETWORK.name}.`);
  const tx: BeamPayTx = { account, beamPay, data: accountData(call), value: 0n };
  let gas: bigint;
  let fees: { maxFeePerGas: bigint };
  try {
    [gas, fees] = await Promise.all([
      publicClient.estimateGas({ account, to: beamPay, data: tx.data }),
      publicClient.estimateFeesPerGas(),
    ]);
  } catch (e) {
    throw new Error(revertCopy(beamPayErrorName(e)) ?? `Couldn't reach ${NETWORK.name}. Check your connection.`);
  }
  let hash: Hash;
  try {
    hash = await sendBeamPay(client, tx, (gas * 12n) / 10n, fees.maxFeePerGas);
  } catch (e) {
    throw new Error(shortError(e));
  }
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 400, timeout: RECEIPT_TIMEOUT_MS });
  } catch {
    throw new Error(`Sent, but ${NETWORK.name} hasn't confirmed it yet. Pull to refresh in a moment.`);
  }
  if (receipt.status !== 'success') throw new Error(await explainRevert(tx, receipt.blockNumber));
}
