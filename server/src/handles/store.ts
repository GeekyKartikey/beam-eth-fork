/**
 * @file One handle per human: a tiny JSON file keyed by `humanHash`
 * (atomic writes via `jsonFile.ts`). The chain stays the source of truth for who owns a name;
 * this file only remembers which human already claimed one.
 */
import type { Address, Hex } from 'viem';
import { readJsonFile, writeJsonFile } from '../jsonFile';

/** What we remember about a claimed handle. */
export type HandleRecord = { label: string; wallet: Address; claimedAt: number };

/** Read and write access to claimed handles. */
export type HandleStore = {
  byHuman: (humanHash: Hex) => HandleRecord | undefined;
  byWallet: (wallet: Address) => HandleRecord | undefined;
  save: (humanHash: Hex, record: HandleRecord) => void;
};

type FileShape = { v: 1; handles: Record<string, HandleRecord> };

/**
 * Opens (or starts) the store at `path`.
 * ponytail: single-instance file store held in memory; move to a DB if more than one server process writes handles.
 * @param path JSON file path, e.g. "data/handles.json".
 * @returns The store.
 */
export function createHandleStore(path: string): HandleStore {
  const parsed = readJsonFile(path) as Partial<FileShape> | undefined;
  let handles: Record<string, HandleRecord> = parsed?.v === 1 && parsed.handles && typeof parsed.handles === 'object' ? parsed.handles : {};
  const key = (humanHash: Hex) => humanHash.toLowerCase();

  return {
    byHuman: (humanHash) => handles[key(humanHash)],
    byWallet: (wallet) => Object.values(handles).find((h) => h.wallet.toLowerCase() === wallet.toLowerCase()),
    save: (humanHash, record) => {
      const next = { ...handles, [key(humanHash)]: record };
      writeJsonFile(path, { v: 1, handles: next } satisfies FileShape);
      handles = next;
    },
  };
}
