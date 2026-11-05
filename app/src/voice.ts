/**
 * @file Voice: read payments and safety verdicts aloud, and the "Read aloud" preference.
 *
 * Speech never confirms anything. A payment read aloud still needs the
 * fingerprint on the review card; listening (in the native module) only fills
 * the message box.
 */
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import type { Intent } from './intent';
import type { Assessment, RiskLevel } from './risk';
import { readJson, writeJson } from './storage';

const KEY = 'readAloud:v1';
const TITLES: Record<RiskLevel, string> = { safe: 'Looks safe', caution: 'Be careful', scam: 'Likely scam' };

let cached: boolean | null = null;
const listeners = new Set<(on: boolean) => void>();

/** @returns Whether new payments and verdicts are read out automatically. */
export async function getReadAloud(): Promise<boolean> {
  if (cached === null) cached = (await readJson(KEY, (v): v is boolean => typeof v === 'boolean').catch(() => null)) ?? false;
  return cached;
}

/** Saves the preference and updates every screen showing it. */
export async function setReadAloud(on: boolean): Promise<void> {
  cached = on;
  listeners.forEach((l) => l(on));
  await writeJson(KEY, on);
}

/** @returns The preference and a setter, kept in sync across screens. */
export function useReadAloud(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(cached ?? false);
  useEffect(() => {
    void getReadAloud().then(setOn);
    listeners.add(setOn);
    return () => void listeners.delete(setOn);
  }, []);
  return [on, (next) => void setReadAloud(next)];
}

/** Speaks text, cutting off anything still being read. */
export function speak(text: string): void {
  void Speech.stop();
  Speech.speak(text, { rate: 0.95 });
}

/** Stops speaking (sheet closed). */
export function stopSpeaking(): void {
  void Speech.stop();
}

/** "an address ending 6 0 4 5": the last four characters, read one by one. */
const spokenAddress = (address: string) => `an address ending ${address.slice(-4).split('').join(' ')}`;

/**
 * What a review card says aloud.
 * @param intent The payment.
 * @param level Its Scam Shield label.
 * @param requestedBy Agent name, when an agent asked for it.
 * @returns e.g. "Claude asks you to pay 0.2 USDC to kartik.eth. Looks safe. Confirm with your fingerprint."
 */
export function paymentSpeech(intent: Intent, level: RiskLevel, requestedBy?: string): string {
  const to = intent.toName ?? spokenAddress(intent.to);
  const lead = requestedBy ? `${requestedBy} asks you to pay` : 'Pay';
  const end = level === 'scam' ? "Don't pay unless you are sure." : 'Confirm with your fingerprint.';
  return `${lead} ${intent.amountDisplay} to ${to}. ${TITLES[level]}. ${end}`;
}

/** What the Safety check card says aloud. */
export function verdictSpeech(a: Assessment, reasons: string[]): string {
  return [TITLES[a.level], ...reasons].join('. ');
}
