/**
 * @file Which Arc network the Wallet screen SHOWS: balance, address link and faucet.
 *
 * Display only. Payments, the BeamPay contract, World ID approvals, ENS and the
 * agent server always run on the build's payment network (`NETWORK`, Arc
 * Testnet); this preference never changes where money moves. It mirrors the
 * testnet/mainnet switcher the Monad build had, kept to viewing a balance.
 */
import { useEffect, useState } from 'react';
import { createPublicClient, defineChain, http, type PublicClient } from 'viem';
import { config, NETWORK } from './config';
import { readJson, writeJson } from './storage';

/** A network the Wallet can show a balance for. */
export type ViewNetwork = {
  chainId: number;
  name: string;
  symbol: string;
  rpcUrl: string;
  explorerUrl: string;
  /** Testnet faucet, or null on mainnet. */
  faucetUrl: string | null;
  testnet: boolean;
};

/** The build's payment network (Arc Testnet). Shown by default; the only one money moves on. */
const TESTNET: ViewNetwork = {
  chainId: NETWORK.chainId,
  name: NETWORK.name,
  symbol: NETWORK.symbol,
  rpcUrl: config.rpcUrl,
  explorerUrl: NETWORK.explorerUrl,
  faucetUrl: NETWORK.faucetUrl,
  testnet: true,
};

/** Arc Mainnet (live since 2026-09-16, chain 5042, USDC gas). View only: nothing is deployed here. */
const MAINNET: ViewNetwork = {
  chainId: 5042,
  name: 'Arc Mainnet',
  symbol: 'USDC',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
  faucetUrl: null,
  testnet: false,
};

/** The two networks the Wallet can show, by chain id. */
export const VIEW_NETWORKS: Record<number, ViewNetwork> = { [TESTNET.chainId]: TESTNET, [MAINNET.chainId]: MAINNET };

const KEY = 'viewNetwork:v1';
const isViewId = (v: unknown): v is number => typeof v === 'number' && v in VIEW_NETWORKS;

let cached: number | null = null;
const listeners = new Set<(id: number) => void>();

/**
 * Loads the saved view network.
 * @returns The saved network, Arc Testnet until the user switches.
 */
export async function getViewNetwork(): Promise<ViewNetwork> {
  if (cached === null) cached = (await readJson(KEY, isViewId).catch(() => null)) ?? TESTNET.chainId;
  return VIEW_NETWORKS[cached];
}

/**
 * The network the Wallet shows, kept in sync across screens.
 * @returns The current view network and a toggle between testnet and mainnet.
 */
export function useViewNetwork(): [ViewNetwork, () => void] {
  const [id, setId] = useState<number>(cached ?? TESTNET.chainId);
  useEffect(() => {
    void getViewNetwork().then((n) => setId(n.chainId));
    listeners.add(setId);
    return () => void listeners.delete(setId);
  }, []);
  const toggle = () => {
    const next = id === MAINNET.chainId ? TESTNET.chainId : MAINNET.chainId;
    cached = next;
    listeners.forEach((l) => l(next));
    void writeJson(KEY, next);
  };
  return [VIEW_NETWORKS[id], toggle];
}

const clients: Record<number, PublicClient> = {};

/**
 * Read-only viem client for a view network, created once and reused. Never used to send.
 * @param net View network.
 * @returns Its public client.
 */
export function viewClient(net: ViewNetwork): PublicClient {
  return (clients[net.chainId] ??= createPublicClient({
    chain: defineChain({
      id: net.chainId,
      name: net.name,
      nativeCurrency: { name: net.symbol, symbol: net.symbol, decimals: 18 },
      rpcUrls: { default: { http: [net.rpcUrl] } },
      blockExplorers: { default: { name: `${net.name} explorer`, url: net.explorerUrl } },
      testnet: net.testnet,
    }),
    transport: http(net.rpcUrl, { retryCount: 3, retryDelay: 300 }),
  }));
}

/**
 * Explorer address page for a view network.
 * @param net View network.
 * @param address Account address.
 * @returns The explorer URL.
 */
export const viewAddressUrl = (net: ViewNetwork, address: string): string => `${net.explorerUrl}/address/${address}`;
