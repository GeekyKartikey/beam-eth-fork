/**
 * @file The payment network and its constants.
 *
 * SHARED FILE: byte-identical copies live at `app/src/network.ts` and
 * `server/src/network.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 *
 * Beam pays in the network's native token only. On Arc that token is USDC
 * (18 native decimals, used for gas too).
 */

/** Keys of the supported networks. */
export type NetworkKey = 'arc';

/** Everything Beam needs to know about a network. */
export type Network = {
  key: NetworkKey;
  chainId: number;
  /** Display name, e.g. "Arc Testnet". */
  name: string;
  /** Native token symbol, e.g. "USDC". */
  symbol: string;
  /** Most fractional digits a user may type (USDC: 6). */
  amountDecimals: number;
  /** Fractional digits shown in the UI (USDC: 2). */
  displayDecimals: number;
  /** Words that mark an amount in text, lowercase, e.g. ["usdc", "usd"]. */
  amountSuffixes: string[];
  /** "$12" counts as an amount on this network (USDC is dollar-pegged). */
  dollarPrefix: boolean;
  /** Payments to a new recipient at or above this need World ID approval (decimal string). */
  newRecipientFloor: string;
  /** Quick-pick amounts offered when an amount is missing (decimal strings). */
  amountChips: string[];
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl: string;
};

export const NETWORKS: Record<NetworkKey, Network> = {
  arc: {
    key: 'arc',
    chainId: 5042002,
    name: 'Arc Testnet',
    symbol: 'USDC',
    amountDecimals: 6,
    displayDecimals: 2,
    amountSuffixes: ['usdc', 'usd', 'dollars', 'dollar'],
    dollarPrefix: true,
    newRecipientFloor: '10',
    amountChips: ['1', '5', '10'],
    rpcUrl: 'https://rpc.testnet.arc.io',
    explorerUrl: 'https://explorer.testnet.arc.io',
    faucetUrl: 'https://faucet.circle.com',
  },
};

/**
 * Resolves the network from an env value.
 * @param key Env value such as "arc"; empty or undefined means Arc.
 * @returns The network.
 * @throws Error when the key is not a supported network, so a typo fails at startup.
 */
export function getNetwork(key: string | undefined): Network {
  const k = (key ?? '').trim().toLowerCase() || 'arc';
  if (k !== 'arc') throw new Error(`Unsupported network "${key}". Use "arc".`);
  return NETWORKS[k];
}

/**
 * Explorer URL for a transaction.
 * @param network Target network.
 * @param hash Transaction hash.
 * @returns Explorer tx page.
 */
export const txUrl = (network: Network, hash: string): string => `${network.explorerUrl}/tx/${hash}`;

/**
 * Explorer URL for an address.
 * @param network Target network.
 * @param address Account or contract address.
 * @returns Explorer address page.
 */
export const addressUrl = (network: Network, address: string): string => `${network.explorerUrl}/address/${address}`;
