/**
 * @file Offline fallback parser cases on Arc (USDC), including ENS names.
 */
import { describe, expect, it } from 'vitest';
import { parseFallback } from '../src/fallbackParser';
import type { Network } from '../src/network';
import { ARC, OTHER, RECIPIENT } from './helpers';

const parseOn =
  (network: Network) =>
  (contextText: string | null, ...userTexts: string[]) =>
    parseFallback({ contextText, userTexts: userTexts.length ? userTexts : ['pay this'], network });
const parseArc = parseOn(ARC);

describe('parseFallback recipients and ambiguity', () => {
  it('1 address + 1 amount → candidate', () => {
    expect(parseArc(`dinner was $2, send to ${RECIPIENT}`)).toEqual({ kind: 'candidate', to: RECIPIENT, amount: '2' });
  });

  it('no payment request from the user → never a candidate (screen alone cannot trigger a payment)', () => {
    const r = parseArc(`dinner was $2, send to ${RECIPIENT}`, "what's my balance?");
    expect(r).toMatchObject({ kind: 'clarify', options: [] });
  });

  it('2 addresses → clarification with both options', () => {
    const r = parseArc(`$2 to ${RECIPIENT} or ${OTHER}`);
    expect(r).toEqual({ kind: 'clarify', question: 'I see 2 recipients. Which one?', options: [RECIPIENT, OTHER] });
  });

  it('same address twice in different case counts once', () => {
    expect(parseArc(`$2 to ${RECIPIENT} (${RECIPIENT.toLowerCase()})`).kind).toBe('candidate');
  });

  it('uppercase hex address is matched', () => {
    const upper = `0x${RECIPIENT.slice(2).toUpperCase()}`;
    expect(parseArc(`$1 to ${upper}`)).toEqual({ kind: 'candidate', to: upper, amount: '1' });
  });

  it('zero-width character inside the address is stripped', () => {
    const split = `${RECIPIENT.slice(0, 20)}​${RECIPIENT.slice(20)}`;
    expect(parseArc(`$1 to ${split}`)).toEqual({ kind: 'candidate', to: RECIPIENT, amount: '1' });
  });

  it('a tapped chip in the newest user message resolves screen ambiguity', () => {
    const r = parseArc(`$2 to ${RECIPIENT} or ${OTHER}`, 'pay this', OTHER);
    expect(r).toEqual({ kind: 'candidate', to: OTHER, amount: '2' });
  });

  it('no recipient → asks for one', () => {
    expect(parseArc('dinner was $2')).toMatchObject({ kind: 'clarify', options: [] });
  });
});

describe('parseFallback on Arc', () => {
  it.each([
    ['$12', '12'],
    ['$ 12.5', '12.5'],
    ['12 USDC', '12'],
    ['12.5 usd', '12.5'],
    ['12 dollars', '12'],
    ['0.000001 USDC', '0.000001'],
  ])('%s → amount %s', (written, amount) => {
    expect(parseArc(`dinner was ${written}, send to ${RECIPIENT}`)).toEqual({ kind: 'candidate', to: RECIPIENT, amount });
  });

  it('bare number is never an amount → asks with dollar chips', () => {
    expect(parseArc(`send 5 to ${RECIPIENT}`)).toEqual({
      kind: 'clarify',
      question: 'How much USDC should I send?',
      options: ['1 USDC', '5 USDC', '10 USDC'],
    });
  });

  it('more than 6 decimals of USDC → not an amount', () => {
    expect(parseArc(`0.0000001 USDC to ${RECIPIENT}`).kind).toBe('clarify');
  });

  it('"$1,500" is not read as 500 or 1', () => {
    expect(parseArc(`send $1,500 to ${RECIPIENT}`).kind).toBe('clarify');
  });

  it('₹ on Arc → "I can only send USDC. How much USDC?"', () => {
    expect(parseArc(`send ₹200 to ${RECIPIENT}`)).toMatchObject({ question: 'I can only send USDC. How much USDC?' });
  });

  it('ENS name as recipient, normalized', () => {
    expect(parseArc('send $5 to Rahul.ETH')).toEqual({ kind: 'candidate', to: 'rahul.eth', amount: '5' });
  });

  it('a name and an address → asks which, with both as options', () => {
    expect(parseArc(`$5 to rahul.eth or ${RECIPIENT}`)).toEqual({
      kind: 'clarify',
      question: 'I see 2 recipients. Which one?',
      options: [RECIPIENT, 'rahul.eth'],
    });
  });

  it('emails and URLs are not names', () => {
    expect(parseArc('pay $5 to me@rahul.eth or rahul.eth.limo').kind).toBe('clarify');
  });
});
