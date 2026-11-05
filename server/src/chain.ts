/**
 * @file Read-only chain access: the payment network client (Arc,
 * built from the shared `Network`) and the ENS client (Ethereum mainnet or
 * Sepolia). The server never sends transactions, so only public clients exist here.
 */
import { createPublicClient, defineChain, http, type Chain, type PublicClient } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import type { EnsChain } from './ens';
import type { ChainReader } from './intent';
import type { Network } from './network';

/** Every payment-chain call the tools and approvals make. A viem PublicClient satisfies it; tests pass a stub. */
export type ChainClient = ChainReader & Pick<PublicClient, 'getTransactionCount' | 'getTransactionReceipt'>;

// ponytail: viem's built-in exponential backoff (300, 600, 1200 ms) is enough for 3 read retries. Sends never happen here.
const RETRY = { retryCount: 3, retryDelay: 300 } as const;

/**
 * Builds the viem chain definition for a network.
 * @param network Shared network constants.
 * @param rpcUrl JSON-RPC URL to use.
 * @returns A viem `Chain`.
 */
export function toViemChain(network: Network, rpcUrl: string): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: network.name, url: network.explorerUrl } },
    testnet: true,
  });
}

/**
 * Creates the payment network client. Reads retry on 429s and timeouts with backoff.
 * @param network Target network.
 * @param rpcUrl JSON-RPC URL.
 * @returns A public client pinned to `network.chainId`.
 */
export function createChainClient(network: Network, rpcUrl: string): PublicClient {
  return createPublicClient({ chain: toViemChain(network, rpcUrl), transport: http(rpcUrl, RETRY) });
}

/**
 * Creates the read-only ENS client used for name resolution and handle checks.
 * @param ensChain "mainnet" or "sepolia".
 * @param rpcUrl JSON-RPC URL for that chain.
 * @returns A public client with viem's ENS contracts configured.
 */
export function createEnsClient(ensChain: EnsChain, rpcUrl: string): PublicClient {
  return createPublicClient({ chain: ensChain === 'sepolia' ? sepolia : mainnet, transport: http(rpcUrl, RETRY) });
}
