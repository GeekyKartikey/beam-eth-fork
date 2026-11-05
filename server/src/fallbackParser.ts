/**
 * @file Offline regex parser used when the agent server is unreachable.
 *
 * SHARED FILE: byte-identical copies live at `app/src/fallbackParser.ts` and
 * `server/src/fallbackParser.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift.
 *
 * It only acts when a user message asks to pay (pay/send/transfer…), and only
 * extracts recipients (`0x` addresses and `.eth` names) and amounts written
 * the network's way ("12 USDC", "$12" on Arc). A single
 * recipient and a single amount yield a candidate; anything else yields a
 * clarification. The caller must still run `prepareTransfer`, so the parser
 * itself grants nothing.
 */
import { extractEnsNames } from './ens';
import { parseAmount, shortAddress, stripZeroWidth } from './intent';
import type { Network } from './network';

const ADDRESS = /0x[a-fA-F0-9]{40}(?![a-fA-F0-9])/g;
// Payment verbs. Without one in a user message, the parser never proposes a payment: screen text alone cannot trigger one.
const PAY_REQUEST = /\b(?:pay|send|transfer|tip|split|settle|give|refund)\b/i;
// Currencies Beam never converts. "$" and "USD" count as fiat only where the native token is not dollar-pegged.
const OTHER_FIAT = /[₹€£]|\b(?:inr|eur|gbp|rs\.?|rupees?|euros?|pounds?)\b/i;
const DOLLAR_FIAT = /\$|\b(?:usd|dollars?)\b/i;

/** A payment candidate (still unvalidated) or a question with tappable options. */
type FallbackResult =
  | { kind: 'candidate'; to: string; amount: string }
  | { kind: 'clarify'; question: string; options: string[] };

/** What the parser reads. */
type FallbackInput = {
  /** Screen or clipboard text, or null when excluded/unavailable. */
  contextText: string | null;
  /** User messages, oldest first. */
  userTexts: string[];
  network: Network;
};

/**
 * Escapes text for use inside a RegExp.
 * @param s Literal text.
 * @returns Escaped pattern.
 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Builds the amount patterns for a network. Leading guards replace lookbehinds
 * so a too-small amount cannot match its tail, and commas count as
 * part of a number so "1,500 USDC" is never read as 500 (it asks instead).
 * @param network Target network.
 * @returns Patterns whose first capture group is the decimal amount.
 */
function amountPatterns(network: Network): RegExp[] {
  const number = `(\\d+(?:\\.\\d{1,${network.amountDecimals}})?)`;
  const suffixes = network.amountSuffixes.map(escapeRegExp).join('|');
  const patterns = [new RegExp(`(?:^|[^\\d.,])${number}\\s*(?:${suffixes})\\b`, 'gi')];
  if (network.dollarPrefix) patterns.push(new RegExp(`(?:^|[^\\w.])\\$\\s*${number}(?![\\d.,]*\\d)`, 'g'));
  return patterns;
}

/**
 * Unique recipients in a text: addresses (case-insensitive, first spelling kept) then names.
 * @param text Source text (zero-width characters already stripped).
 * @returns Recipients in order of appearance per kind.
 */
function extractRecipients(text: string): string[] {
  const addresses = new Map<string, string>();
  for (const a of text.match(ADDRESS) ?? []) if (!addresses.has(a.toLowerCase())) addresses.set(a.toLowerCase(), a);
  return [...addresses.values(), ...extractEnsNames(text)];
}

/**
 * Unique amounts in a text, compared by value.
 * @param text Source text (zero-width characters already stripped).
 * @param network Network whose amount format to use.
 * @returns Amount strings as written, e.g. ["2.5"].
 */
function extractAmounts(text: string, network: Network): string[] {
  const seen = new Map<bigint, string>();
  for (const pattern of amountPatterns(network)) {
    for (const m of text.matchAll(pattern)) {
      const wei = parseAmount(m[1], network);
      if (wei !== null && wei > 0n && !seen.has(wei)) seen.set(wei, m[1]);
    }
  }
  return [...seen.values()];
}

/**
 * Picks matches from the newest user message that has any, else from the context.
 * A chip the user tapped therefore overrides ambiguity on screen.
 * @param extract Extractor to apply.
 * @param userTexts User messages, oldest first.
 * @param contextText Context text or null.
 * @returns The chosen matches.
 */
function pick(extract: (t: string) => string[], userTexts: string[], contextText: string | null): string[] {
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const found = extract(userTexts[i]);
    if (found.length) return found;
  }
  return contextText ? extract(contextText) : [];
}

/**
 * Parses a payment request without AI.
 * @param input Context, user messages and the network.
 * @returns A payment candidate or a clarification question with options.
 */
export function parseFallback(input: FallbackInput): FallbackResult {
  const { network } = input;
  const context = input.contextText === null ? null : stripZeroWidth(input.contextText);
  const users = input.userTexts.map(stripZeroWidth);
  if (!users.some((t) => PAY_REQUEST.test(t))) {
    return { kind: 'clarify', question: 'Agent offline. I can still prepare a payment: say "pay this".', options: [] };
  }
  const recipients = pick(extractRecipients, users, context);
  const amounts = pick((t) => extractAmounts(t, network), users, context);

  if (recipients.length === 0) {
    return { kind: 'clarify', question: 'I need a 0x address or .eth name. Copy it and tap "Use clipboard".', options: [] };
  }
  if (recipients.length > 1) {
    return { kind: 'clarify', question: `I see ${recipients.length} recipients. Which one?`, options: recipients.slice(0, 4) };
  }
  if (amounts.length !== 1) {
    const all = [context ?? '', ...users].join(' ');
    const fiat = amounts.length === 0 && (OTHER_FIAT.test(all) || (!network.dollarPrefix && DOLLAR_FIAT.test(all)));
    const chips = amounts.length ? amounts.slice(0, 4) : network.amountChips;
    return {
      kind: 'clarify',
      question: fiat ? `I can only send ${network.symbol}. How much ${network.symbol}?` : `How much ${network.symbol} should I send?`,
      options: chips.map((a) => `${a} ${network.symbol}`),
    };
  }
  return { kind: 'candidate', to: recipients[0], amount: amounts[0] };
}

/**
 * Label for a clarification chip: addresses are shortened, other options shown as-is.
 * @param option Option value sent back as the user's message when tapped.
 * @returns Display label.
 */
export function chipLabel(option: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(option) ? shortAddress(option) : option;
}
