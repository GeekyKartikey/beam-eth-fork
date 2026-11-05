/**
 * @file Runtime configuration from `EXPO_PUBLIC_*` env vars: the network this
 * build pays on, its viem chain, the BeamPay deployment and the ENS chain.
 *
 * `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, so they
 * are public. `agentToken` is demo-grade auth only (see README).
 */
import { defineChain } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { DEFAULT_ENS_RPC, type EnsChain } from './ens';
import { toChecksumAddress } from './intent';
import { getNetwork } from './network';

const env = process.env;

/** The one network this build pays on (`EXPO_PUBLIC_NETWORK`, default Arc). A typo fails at startup. */
export const NETWORK = getNetwork(env.EXPO_PUBLIC_NETWORK);

/** Chain ENS names are resolved on (`EXPO_PUBLIC_ENS_CHAIN`, default mainnet). */
const ENS_CHAIN_KEY: EnsChain = env.EXPO_PUBLIC_ENS_CHAIN?.trim().toLowerCase() === 'sepolia' ? 'sepolia' : 'mainnet';
const ENS_CHAIN = ENS_CHAIN_KEY === 'sepolia' ? sepolia : mainnet;

export const config = {
  privyAppId: env.EXPO_PUBLIC_PRIVY_APP_ID ?? '',
  privyClientId: env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? '',
  /** Agent server base URL, no trailing slash. */
  agentUrl: (env.EXPO_PUBLIC_AGENT_URL ?? '').replace(/\/+$/, ''),
  agentToken: env.EXPO_PUBLIC_AGENT_TOKEN ?? '',
  /** Payment network RPC; `EXPO_PUBLIC_RPC_URL` overrides the network default. */
  rpcUrl: env.EXPO_PUBLIC_RPC_URL || NETWORK.rpcUrl,
  /** BeamPay on `NETWORK`; null until deployed and set, which blocks payments. */
  beamPay: toChecksumAddress(env.EXPO_PUBLIC_BEAMPAY_ADDRESS ?? ''),
  ensChain: ENS_CHAIN,
  /** ENS read RPC; falls back to the same keyless default the server uses. */
  ensRpcUrl: env.EXPO_PUBLIC_ENS_RPC_URL || DEFAULT_ENS_RPC[ENS_CHAIN_KEY],
} as const;

/** `NETWORK` as a viem chain, for the read client, the wallet client and Privy. */
export const chain = defineChain({
  id: NETWORK.chainId,
  name: NETWORK.name,
  nativeCurrency: { name: NETWORK.symbol, symbol: NETWORK.symbol, decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  blockExplorers: { default: { name: `${NETWORK.name} explorer`, url: NETWORK.explorerUrl } },
  testnet: true,
});
