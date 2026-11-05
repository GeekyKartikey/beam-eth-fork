/**
 * @file Guards the BeamPay ABI contract: every entry of `BEAM_PAY_ABI` must match the compiled
 * `contracts/out/BeamPay.sol/BeamPay.json` (name, input types, indexed flags, outputs, mutability).
 * Needs `forge build` in `contracts/` first; skips with a warning when the artifact is missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEAM_PAY_ABI } from '../src/beamPay';

const ARTIFACT = new URL('../../contracts/out/BeamPay.sol/BeamPay.json', import.meta.url);
const missing = !existsSync(ARTIFACT);
if (missing) console.warn('beamPayAbi.test.ts skipped: contracts/out is missing; run `forge build` in contracts/ first.');

/** ABI entry fields compared between the TS copy and the compiled artifact. */
type Entry = {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: readonly { type: string; indexed?: boolean }[];
  outputs?: readonly { type: string }[];
};

/** Reduces an ABI entry to the parts that affect encoding and decoding (parameter names do not). */
const shape = (e: Entry) => ({
  type: e.type,
  name: e.name,
  stateMutability: e.stateMutability,
  inputs: e.inputs?.map((p) => ({ type: p.type, indexed: p.indexed ?? false })),
  outputs: e.outputs?.map((p) => p.type),
});

describe.skipIf(missing)('BEAM_PAY_ABI matches the compiled BeamPay (skipped if contracts are not built)', () => {
  const compiled: Entry[] = missing ? [] : JSON.parse(readFileSync(ARTIFACT, 'utf8')).abi;

  it.each(BEAM_PAY_ABI.map((e) => [`${e.type} ${e.name}`, e] as const))('%s', (_, entry) => {
    const match = compiled.find((c) => c.type === entry.type && c.name === entry.name);
    expect(match, `${entry.type} ${entry.name} is not in the compiled ABI`).toBeDefined();
    expect(shape(entry)).toEqual(shape(match as Entry));
  });
});
