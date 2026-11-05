/**
 * @file Read-only viem clients: the payment network (balances, BeamPay reads,
 * receipts) and the ENS chain (name resolution), plus the `TransferDeps` the
 * device passes to `prepareTransfer`.
 *
 * Reads retry with exponential backoff (3 tries from 300 ms) for RPC 429s and
 * timeouts. Sends never go through these clients and are never retried.
 */
import { createPublicClient, http } from 'viem';
import { chain, config } from './config';
import { createNameResolver } from './ens';
import type { TransferDeps } from './intent';

/** Shared public client for balances, BeamPay reads, receipts and transfer preparation. */
export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl, { retryCount: 3, retryDelay: 300 }),
});

/** ENS reads on mainnet (or Sepolia when `EXPO_PUBLIC_ENS_CHAIN=sepolia`). */
const ensClient = createPublicClient({
  chain: config.ensChain,
  transport: http(config.ensRpcUrl, { retryCount: 2, retryDelay: 300 }),
});

/** Resolves names for payments on the active network (coin type of `NETWORK.chainId`). */
export const resolveName = createNameResolver(ensClient, chain.id);

/** Device-side dependencies of `prepareTransfer`. */
export const transferDeps: TransferDeps = { chain: publicClient, resolveName };
