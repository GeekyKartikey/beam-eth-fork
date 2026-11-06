/**
 * @file AsyncStorage-backed local state: defensive JSON helpers, the known
 * recipient list, the ENS name cache, the executed-intent set and the payment
 * activity list.
 *
 * Every read is defensive: missing, corrupt or foreign data reads as "absent"
 * instead of throwing, so a bad write can never brick the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, Hash } from 'viem';
import { toChecksumAddress } from './intent';

/** Storage keys. Bump the version suffix when a shape changes. */
export const KEYS = {
  limits: 'limits:v2',
  recipients: 'recipients:v1',
  names: 'names:v1',
  executed: 'executed:v1',
  pending: 'pending:v1',
  activity: 'activity:v1',
  /** Last signed-in wallet; when it changes, account-scoped state is cleared. */
  wallet: 'wallet:v1',
} as const;

/** Pre-activity single-entry key, migrated into `activity:v1` on first read. */
const LEGACY_LAST_TX_KEY = 'lastTx:v1';

/** Most recent payments kept for the Activity tab. */
const MAX_ACTIVITY = 20;

/** Most executed intent IDs kept; intents expire after 5 min, so this is generous. */
const MAX_EXECUTED = 200;

/**
 * Plain-object type guard.
 * @param v Any value.
 * @returns True for non-null, non-array objects.
 */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * String-array type guard.
 * @param v Any value.
 * @returns True when `v` is an array of strings.
 */
export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Non-negative integer decimal string guard (wei amounts).
 * @param v Any value.
 * @returns True for strings like "0" or "2000000000000000000".
 */
export const isWeiString = (v: unknown): v is string => typeof v === 'string' && /^\d{1,78}$/.test(v);

/**
 * Transaction hash guard.
 * @param v Any value.
 * @returns True for a 0x-prefixed 32-byte hex string.
 */
export const isHash = (v: unknown): v is Hash => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);

/**
 * Reads and validates a JSON value.
 * @param key Storage key.
 * @param guard Type guard the parsed value must pass.
 * @returns The value, or null when missing, unparsable or the wrong shape.
 */
export async function readJson<T>(key: string, guard: (v: unknown) => v is T): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return guard(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Writes a JSON value.
 * @param key Storage key.
 * @param value Serializable value.
 * @returns Resolves once stored.
 */
export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/**
 * Deletes a key.
 * @param key Storage key.
 * @returns Resolves once removed.
 */
/**
 * Clears account-scoped local state when the signed-in wallet changes, so a new
 * account never shows the previous account's activity, limits, recipients or spend.
 * Device preferences (read-aloud, view network, avatar) are per-device and kept.
 * @param address Current wallet address.
 * @returns True when state was reset (the wallet differs from last time).
 */
export async function resetLocalIfWalletChanged(address: string): Promise<boolean> {
  const a = address.toLowerCase();
  const prev = await readJson(KEYS.wallet, (v): v is string => typeof v === 'string').catch(() => null);
  if (prev === a) return false;
  const all = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const scoped = [KEYS.limits, KEYS.recipients, KEYS.names, KEYS.executed, KEYS.pending, KEYS.activity, LEGACY_LAST_TX_KEY];
  const spend = all.filter((k) => k.startsWith('spend:'));
  await AsyncStorage.multiRemove([...scoped, ...spend]).catch(() => {});
  await writeJson(KEYS.wallet, a);
  return true;
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

/**
 * Addresses this wallet has paid successfully before.
 * @returns Lowercased addresses.
 */
export async function getRecipients(): Promise<Set<string>> {
  return new Set((await readJson(KEYS.recipients, isStringArray))?.map((a) => a.toLowerCase()) ?? []);
}

/**
 * Remembers a recipient after a confirmed payment.
 * @param address Recipient address.
 * @returns Resolves once stored.
 */
export async function addRecipient(address: Address): Promise<void> {
  const known = await getRecipients();
  if (known.has(address.toLowerCase())) return;
  await writeJson(KEYS.recipients, [...known, address.toLowerCase()]);
}

const isNameMap = (v: unknown): v is Record<string, string> =>
  isRecord(v) && Object.values(v).every((a) => typeof a === 'string' && toChecksumAddress(a) !== null);

/**
 * ENS names paid before and the address each resolved to at the time.
 * @returns Normalized name to checksummed address.
 */
export async function getNames(): Promise<Record<string, Address>> {
  const stored = (await readJson(KEYS.names, isNameMap)) ?? {};
  return Object.fromEntries(Object.entries(stored).map(([name, a]) => [name, toChecksumAddress(a) as Address]));
}

/**
 * Remembers which address a name resolved to after a confirmed payment.
 * @param name Normalized ENS name.
 * @param address Address the payment went to.
 * @returns Resolves once stored.
 */
export async function rememberName(name: string, address: Address): Promise<void> {
  await writeJson(KEYS.names, { ...(await getNames()), [name]: address });
}

// In-memory mirror so a second tap in the same session is blocked before storage resolves.
const executedMemo = new Set<string>();

/**
 * Whether an intent has already been sent.
 * @param id Intent ID.
 * @returns True if it was marked executed in this session or a previous one.
 */
export async function isExecuted(id: string): Promise<boolean> {
  if (executedMemo.has(id)) return true;
  return (await readJson(KEYS.executed, isStringArray))?.includes(id) ?? false;
}

/**
 * Marks an intent as used so it can never be sent twice.
 * @param id Intent ID.
 * @returns Resolves once stored.
 */
export async function markExecuted(id: string): Promise<void> {
  executedMemo.add(id);
  const ids = (await readJson(KEYS.executed, isStringArray)) ?? [];
  if (!ids.includes(id)) await writeJson(KEYS.executed, [...ids, id].slice(-MAX_EXECUTED));
}

/** A finished payment, shown in the Activity tab. Chain data and the ENS name paid, never screen text. */
export type ActivityTx = {
  hash: Hash;
  to: Address;
  /** ENS name when paid by name. */
  toName?: string;
  amountWei: string;
  status: 'confirmed' | 'failed';
  at: number;
};

const isActivityTx = (v: unknown): v is ActivityTx =>
  isRecord(v) &&
  isHash(v.hash) &&
  typeof v.to === 'string' &&
  toChecksumAddress(v.to) !== null &&
  (v.toName === undefined || typeof v.toName === 'string') &&
  isWeiString(v.amountWei) &&
  (v.status === 'confirmed' || v.status === 'failed') &&
  typeof v.at === 'number';

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * Reads recent payments, newest first. Corrupt entries are dropped one by one
 * rather than discarding the whole list. On first run after the upgrade, the
 * old single `lastTx:v1` entry becomes the list's only item and is removed.
 * @returns Up to 20 payments, newest first.
 */
export async function getActivity(): Promise<ActivityTx[]> {
  const stored = await readJson(KEYS.activity, isArray);
  if (stored) return stored.filter(isActivityTx).slice(0, MAX_ACTIVITY);
  const legacy = await readJson(LEGACY_LAST_TX_KEY, isActivityTx);
  if (!legacy) return [];
  await writeJson(KEYS.activity, [legacy]);
  await removeKey(LEGACY_LAST_TX_KEY);
  return [legacy];
}

/**
 * Records a finished payment at the top of the activity list (deduplicated by
 * hash, capped at 20).
 * @param tx Payment summary (no screen text).
 * @returns Resolves once stored.
 */
export async function addActivity(tx: ActivityTx): Promise<void> {
  const rest = (await getActivity()).filter((t) => t.hash !== tx.hash);
  await writeJson(KEYS.activity, [tx, ...rest].slice(0, MAX_ACTIVITY));
}
