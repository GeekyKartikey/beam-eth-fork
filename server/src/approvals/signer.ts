/**
 * @file EIP-712 approval signing with the approver key. The approver can only
 * authorize BeamPay actions the wallet owner then submits; it holds no funds
 * and cannot move any.
 */
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { APPROVAL_TYPES, beamPayDomain } from '../beamPay';

/** Signs the three BeamPay approval types for one deployment. */
export type Approver = {
  address: Address;
  signPay: (m: { payer: Address; to: Address; amount: bigint; intentHash: Hex; nonce: bigint; deadline: bigint }) => Promise<Hex>;
  signCap: (m: { account: Address; cap: bigint; nonce: bigint; deadline: bigint }) => Promise<Hex>;
  signLink: (m: { account: Address; humanHash: Hex; nonce: bigint; deadline: bigint }) => Promise<Hex>;
};

/**
 * Creates the approver.
 * @param privateKey `APPROVER_PRIVATE_KEY`.
 * @param chainId Chain BeamPay is deployed on.
 * @param beamPay BeamPay address (EIP-712 verifying contract).
 * @returns An `Approver`.
 */
export function createApprover(privateKey: Hex, chainId: number, beamPay: Address): Approver {
  const account = privateKeyToAccount(privateKey);
  const domain = beamPayDomain(chainId, beamPay);
  return {
    address: account.address,
    signPay: (message) => account.signTypedData({ domain, types: APPROVAL_TYPES, primaryType: 'PayApproval', message }),
    signCap: (message) => account.signTypedData({ domain, types: APPROVAL_TYPES, primaryType: 'CapApproval', message }),
    signLink: (message) => account.signTypedData({ domain, types: APPROVAL_TYPES, primaryType: 'HumanLink', message }),
  };
}
