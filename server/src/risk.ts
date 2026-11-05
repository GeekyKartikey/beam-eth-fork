/**
 * @file Scam Shield: risk signals, the deterministic floor, and how signals
 * and payment warnings become one of three labels.
 *
 * SHARED FILE: byte-identical copies live at `app/src/risk.ts` and
 * `server/src/risk.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 *
 * The model reports what it sees through `assess_screen`, but it can only
 * raise the level. The regex floor here and the payment warnings decide the
 * minimum, so text on the screen cannot talk Beam into "Looks safe".
 */
import type { IntentWarning } from './intent';

/** Looks safe, Be careful, Likely scam. */
export type RiskLevel = 'safe' | 'caution' | 'scam';

/** Scam patterns found in screen text. Copy for each lives on the device. */
export type RiskSignal =
  | 'CREDENTIAL_REQUEST'
  | 'REMOTE_ACCESS'
  | 'PAY_TO_RECEIVE'
  | 'TOO_GOOD_TO_BE_TRUE'
  | 'URGENCY'
  | 'IMPERSONATION'
  | 'SUSPICIOUS_LINK';

export const RISK_LEVELS = ['safe', 'caution', 'scam'] as const satisfies readonly RiskLevel[];
export const RISK_SIGNALS = [
  'CREDENTIAL_REQUEST',
  'REMOTE_ACCESS',
  'PAY_TO_RECEIVE',
  'TOO_GOOD_TO_BE_TRUE',
  'URGENCY',
  'IMPERSONATION',
  'SUSPICIOUS_LINK',
] as const satisfies readonly RiskSignal[];

/** A verdict on the screen: the level plus the signals behind it. */
export type Assessment = { level: RiskLevel; signals: RiskSignal[] };

/** Signals that on their own mean money is about to be lost. Weight 2; the rest weigh 1. */
const STRONG: ReadonlySet<RiskSignal> = new Set(['CREDENTIAL_REQUEST', 'REMOTE_ACCESS', 'PAY_TO_RECEIVE']);

/**
 * Phrasings, not keywords: "Your OTP is 4821, do not share it" is a normal
 * bank SMS and must not match, "share the OTP you received" must.
 * ponytail: English and common Hinglish only; the model covers other languages.
 */
const PATTERNS: [RiskSignal, RegExp][] = [
  [
    'CREDENTIAL_REQUEST',
    /\b(share|send|tell|give|provide|forward|read out|enter|type)\b[^.!?\n]{0,30}\b(otp|one[- ]time (?:password|code)|upi pin|atm pin|cvv|password|seed phrase|recovery phrase|secret phrase|private key|12[- ]word|24[- ]word)\b/i,
  ],
  [
    'REMOTE_ACCESS',
    /\b(anydesk|teamviewer|rustdesk|quick ?support|airdroid|share (?:your |the )?screen|screen ?shar(?:e|ing)|install (?:this|the|our) app|download (?:this|the|our) (?:app|apk)|\w+\.apk)\b/i,
  ],
  [
    'PAY_TO_RECEIVE',
    /\b(?:pay|send|deposit|transfer)\b[^.!?\n]{0,40}\b(?:to (?:receive|claim|unlock|release|withdraw|get) (?:your|the)|processing fee|release fee|unlock fee|verification fee|registration fee|gas fee to claim)\b|\b(?:approve|accept) (?:the |this )?(?:collect )?request to (?:receive|get)\b/i,
  ],
  [
    'TOO_GOOD_TO_BE_TRUE',
    /\b(lottery|you(?:'ve| have)? won|jackpot|guaranteed (?:returns?|profits?)|double your|2x your (?:money|crypto)|free (?:crypto|money|airdrop)|claim (?:your )?(?:airdrop|reward|prize))\b/i,
  ],
  [
    'URGENCY',
    /\b(urgent(?:ly)?|immediately|act now|last chance|within \d+ (?:min|mins|minutes|hours?)|account (?:will be |has been |is )?(?:blocked|suspended|frozen|closed|deactivated)|kyc (?:expired|pending|update))\b/i,
  ],
  [
    'IMPERSONATION',
    /\b(customer (?:care|support|service)|help ?desk|bank official|from (?:the )?(?:rbi|sbi|npci|income tax|cyber ?cell|police|customs)|wallet support|metamask support|support team)\b/i,
  ],
  [
    'SUSPICIOUS_LINK',
    /\b(?:bit\.ly|tinyurl\.com|is\.gd|cutt\.ly|rb\.gy|t\.ly)\/|https?:\/\/\d{1,3}(?:\.\d{1,3}){3}|https?:\/\/[^\s/]*xn--/i,
  ],
];

/** A sentence that warns against an action ("Never share your PIN") rather than asking for it. */
const NEGATED = /\b(?:not|never|don't|dont|do not)\b/i;

/** "Is this safe?", "scam?", "legit", "fraud", "can I trust". */
const SAFETY_QUESTION = /\b(safe|scam|legit|fraud|fake|trust|genuine|real\b|spam|phishing)/i;

/** Payment warnings that make the label at least "Be careful". */
const CAUTION_WARNINGS: ReadonlySet<IntentWarning> = new Set([
  'RECIPIENT_IS_CONTRACT',
  'AMOUNT_NOT_IN_CONTEXT',
  'PARSED_WITHOUT_AI',
  'NAME_ADDRESS_CHANGED',
  'NAME_NOT_PRIMARY',
]);

const RANK: Record<RiskLevel, number> = { safe: 0, caution: 1, scam: 2 };

/**
 * The higher of two levels.
 * @param a A level.
 * @param b A level.
 * @returns The riskier one.
 */
export function maxLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

/**
 * Deterministic scan of untrusted screen text.
 * @param text Captured screen or clipboard text.
 * @returns Signals found, in `RISK_SIGNALS` order.
 */
export function scanText(text: string): RiskSignal[] {
  // Checked per sentence so a warning in one sentence cannot hide a request in the next.
  const sentences = text.split(/[.!?\n]+/).filter((s) => !NEGATED.test(s));
  return PATTERNS.filter(([signal, re]) =>
    signal === 'CREDENTIAL_REQUEST' ? sentences.some((s) => re.test(s)) : re.test(text),
  ).map(([signal]) => signal);
}

/**
 * Level the signals alone justify: strong signals weigh 2, others 1.
 * Three or more is "Likely scam", one or two is "Be careful".
 * @param signals Signals found.
 * @returns The floor level.
 */
export function levelForSignals(signals: readonly RiskSignal[]): RiskLevel {
  const score = signals.reduce((sum, s) => sum + (STRONG.has(s) ? 2 : 1), 0);
  return score >= 3 ? 'scam' : score >= 1 ? 'caution' : 'safe';
}

/**
 * Merges a reported assessment with the deterministic floor.
 * @param floor Signals from `scanText`.
 * @param reported The model's (or server's) assessment, if any. Untrusted: it can only raise the level.
 * @returns Union of signals, level at least what the signals justify.
 */
export function mergeAssessment(floor: readonly RiskSignal[], reported: Assessment | null): Assessment {
  const signals = RISK_SIGNALS.filter((s) => floor.includes(s) || !!reported?.signals.includes(s));
  return { level: maxLevel(reported?.level ?? 'safe', levelForSignals(signals)), signals };
}

/**
 * The screen verdict for one turn, or null when nobody asked and nothing looks wrong.
 * Shown when the user asked about safety, when a payment is on the table, when
 * the model assessed, or when the floor found something.
 * @param input.contextText Screen text, or null when excluded or missing.
 * @param input.lastUserText The message that started this turn.
 * @param input.reported Model assessment, if it called `assess_screen`.
 * @param input.hasIntents Whether a payment was prepared this turn.
 * @returns The assessment to show, or null.
 */
export function screenAssessment(input: {
  contextText: string | null;
  lastUserText: string;
  reported: Assessment | null;
  hasIntents: boolean;
}): Assessment | null {
  const floor = input.contextText ? scanText(input.contextText) : [];
  const merged = mergeAssessment(floor, input.reported);
  const wanted = !!input.reported || input.hasIntents || SAFETY_QUESTION.test(input.lastUserText) || floor.length > 0;
  if (!wanted || (!input.contextText && !input.reported && !input.hasIntents)) return null;
  return merged;
}

/**
 * Label for one payment: its own warnings, raised by the screen verdict.
 * @param warnings The intent's warnings, including device-only ones.
 * @param screen The turn's screen verdict, if any.
 * @returns The payment's level.
 */
export function paymentLevel(warnings: readonly IntentWarning[], screen: Assessment | null): RiskLevel {
  const own: RiskLevel = warnings.some((w) => CAUTION_WARNINGS.has(w)) ? 'caution' : 'safe';
  return maxLevel(own, screen?.level ?? 'safe');
}
