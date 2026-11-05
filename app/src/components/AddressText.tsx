/**
 * @file Full address in monospace, grouped in fours, with the first and last
 * six characters emphasized so users can compare them against the source.
 */
import { StyleSheet } from 'react-native';
import { fonts } from '../theme';
import { Text } from './ui';

/** Characters emphasized at each end ("0xAbC1" … "9F1234"). */
const EDGE = 6;

/**
 * Splits an address into display runs: "0x", then 4-char groups, with emphasis flags.
 * @param address 0x-prefixed address.
 * @returns Runs of text with a `strong` flag; groups are separated by spaces.
 */
function toRuns(address: string): { text: string; strong: boolean }[] {
  const groups = ['0x', ...(address.slice(2).match(/.{1,4}/g) ?? [])].join(' ');
  const lastStrong = address.length - EDGE;
  const runs: { text: string; strong: boolean }[] = [];
  let index = 0; // position in `address`, ignoring the inserted spaces
  for (const ch of groups) {
    const prev = runs[runs.length - 1];
    const strong = ch === ' ' ? (prev?.strong ?? false) : index < EDGE || index >= lastStrong;
    if (ch !== ' ') index++;
    if (prev && prev.strong === strong) prev.text += ch;
    else runs.push({ text: ch, strong });
  }
  return runs;
}

/**
 * Grouped, partly bold address. Selectable so it can be copied by long-press.
 * @param props.address Checksummed address.
 * @param props.align Text alignment (default left).
 * @returns Monospace text.
 */
export function AddressText({ address, align }: { address: string; align?: 'left' | 'center' }) {
  return (
    <Text variant="mono" color="textSecondary" align={align} selectable accessibilityLabel={`Address ${address}`}>
      {toRuns(address).map((r, i) => (
        <Text key={i} variant="mono" color={r.strong ? 'text' : 'textSecondary'} style={r.strong && styles.strong}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({ strong: { fontFamily: fonts.monoBold } });
