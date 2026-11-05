/**
 * @file Context chip at the top of the Ask sheet: shows what was
 * read, lets the user inspect the raw text and switch it off, or offers the
 * clipboard when the screen couldn't be read.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { AgentContext } from '../agentApi';
import { colors, HIT, radius, space } from '../theme';
import { Button, IconTile, Pill, Text, Toggle } from './ui';

/** Captured screen or clipboard text, as shown and sent. */
export type CapturedContext = AgentContext & { truncated: boolean };

export type ContextState =
  | { kind: 'captured'; ctx: CapturedContext }
  /** The app was read but exposes no text (Flutter, canvas, games). */
  | { kind: 'empty'; appLabel: string }
  /** No capture: accessibility off, capture expired, or our own app. */
  | { kind: 'unavailable'; accessibilityOn: boolean };

type Props = {
  state: ContextState;
  excluded: boolean;
  onExcludedChange: (excluded: boolean) => void;
  onUseClipboard: () => void;
  /** e.g. "Clipboard is empty." */
  clipboardError: string | null;
};

/**
 * Context chip: expandable captured text with a "Use this context" toggle, or
 * the clipboard fallback when nothing was captured.
 * @param props.state What was captured.
 * @param props.excluded Whether the user excluded the text from requests.
 * @param props.onExcludedChange Toggles exclusion.
 * @param props.onUseClipboard Reads the clipboard (only on this explicit tap).
 * @param props.clipboardError Message after a failed clipboard read.
 * @returns The chip.
 */
export function ContextChip({ state, excluded, onExcludedChange, onUseClipboard, clipboardError }: Props) {
  const [open, setOpen] = useState(false);

  if (state.kind !== 'captured') {
    const body =
      state.kind === 'empty'
        ? `${state.appLabel} doesn't expose its text. Copy the details and tap "Use clipboard".`
        : state.accessibilityOn
          ? 'Copy the details and tap "Use clipboard".'
          : 'Turn on Beam screen reader in Accessibility settings so I can see your screen, or use your clipboard.';
    return (
      <View style={[styles.box, styles.muted]}>
        <View style={styles.head}>
          <IconTile icon="eye-off" tone="neutral" size={36} />
          <View style={styles.flex}>
            <Text variant="captionStrong">{"Couldn't read the screen"}</Text>
            <Text variant="caption" color="textSecondary">
              {body}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button size="sm" variant="secondary" icon="clipboard" label="Use clipboard" onPress={onUseClipboard} />
          {clipboardError ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              {clipboardError}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const { ctx } = state;
  const chars = `${ctx.text.length} chars`;
  return (
    <View style={[styles.box, excluded ? styles.muted : styles.active]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${excluded ? 'Not using' : 'Reading'}: ${ctx.appLabel} · ${chars}${ctx.truncated ? ', truncated' : ''}`}
        accessibilityHint={open ? 'Hides the captured text' : 'Shows the captured text'}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <IconTile icon={ctx.source === 'clipboard' ? 'clipboard' : 'smartphone'} tone={excluded ? 'neutral' : 'primary'} size={36} />
        <View style={styles.flex}>
          <Text variant="captionStrong" color={excluded ? 'textSecondary' : 'text'} numberOfLines={1}>
            {excluded ? `Not using ${ctx.appLabel}` : `Reading ${ctx.appLabel}`}
          </Text>
          <View style={styles.meta}>
            <Text variant="mono" color="textTertiary" style={styles.metaText}>
              {chars}
            </Text>
            {ctx.truncated ? <Pill label="Truncated" tone="warning" /> : null}
          </View>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
      </Pressable>
      {open ? (
        <>
          <ScrollView style={[styles.raw, excluded && styles.rawOnMuted]} nestedScrollEnabled>
            <Text variant="mono" color="textSecondary" selectable>
              {ctx.text}
            </Text>
          </ScrollView>
          <View style={styles.toggleRow}>
            <Text variant="callout" style={styles.flex}>
              Use this context
            </Text>
            <Toggle label="Use this context" value={!excluded} onValueChange={(use) => onExcludedChange(!use)} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, borderWidth: 1, padding: space.sm + 2, gap: space.sm },
  active: { backgroundColor: colors.surface, borderColor: colors.primarySoftBorder },
  muted: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: HIT - 8 },
  pressed: { opacity: 0.6 },
  flex: { flex: 1, gap: space.xxs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  metaText: { fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', paddingLeft: 36 + space.md },
  raw: {
    maxHeight: 140,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: space.md,
  },
  rawOnMuted: { backgroundColor: colors.surface },
  toggleRow: { flexDirection: 'row', alignItems: 'center', minHeight: HIT, gap: space.md, paddingHorizontal: space.xs },
});
