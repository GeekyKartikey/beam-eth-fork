/**
 * @file Chat rows for the Ask sheet: user bubbles (right, purple), agent
 * bubbles (left, with the brand avatar), the animated typing indicator and
 * compact system notices (agent offline, auth failure, errors).
 */
import { Icon } from './Icon';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { BrandMark } from './BrandMark';
import { Text, type IconName } from './ui';

const AVATAR = 20;
const BUBBLE_RADIUS = 18;
const DOTS = 3;
const DOT_STEP_MS = 160;

/**
 * Left-aligned agent row: brand avatar beside a muted bubble.
 * @param props.children Bubble content.
 * @param props.label Accessible label for the whole row.
 * @returns The row.
 */
function AgentRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.agentRow} accessible accessibilityLabel={label}>
      <View style={styles.avatar}>
        <BrandMark size={AVATAR} />
      </View>
      <View style={[styles.bubble, styles.agent]}>{children}</View>
    </View>
  );
}

/**
 * One chat message.
 * @param props.role Who wrote it.
 * @param props.text Message text.
 * @returns A right-aligned user bubble or a left-aligned agent row.
 */
export function MessageBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  if (role === 'user') {
    return (
      <View style={[styles.bubble, styles.user]} accessible accessibilityLabel={`You: ${text}`}>
        <Text variant="body" color="textInverse" selectable>
          {text}
        </Text>
      </View>
    );
  }
  return (
    <AgentRow label={`Agent: ${text}`}>
      <Text variant="body" selectable>
        {text}
      </Text>
    </AgentRow>
  );
}

/**
 * Three pulsing dots in an agent bubble while the agent is working.
 * @returns The typing row, announced as "Agent is thinking".
 */
export function TypingIndicator() {
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: DOTS + 1, duration: DOT_STEP_MS * (DOTS + 1) * 2, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [phase]);

  return (
    <AgentRow label="Agent is thinking">
      <View style={styles.dots}>
        {Array.from({ length: DOTS }, (_, i) => {
          // Each dot peaks one step after the previous one, then rests.
          const range = { inputRange: [i, i + 0.5, i + 1, DOTS + 1], extrapolate: 'clamp' as const };
          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  opacity: phase.interpolate({ ...range, outputRange: [0.35, 1, 0.35, 0.35] }),
                  transform: [{ translateY: phase.interpolate({ ...range, outputRange: [0, -3, 0, 0] }) }],
                },
              ]}
            />
          );
        })}
      </View>
    </AgentRow>
  );
}

/**
 * Compact tinted system line (e.g. "Agent offline. Using basic parser.").
 * @param props.text Notice copy.
 * @param props.tone `warning` (amber) or `danger` (red).
 * @param props.icon Leading Feather icon.
 * @returns The notice row, announced as an alert.
 */
export function NoticeRow({ text, tone, icon }: { text: string; tone: 'warning' | 'danger'; icon: IconName }) {
  const warn = tone === 'warning';
  return (
    <View
      accessibilityRole="alert"
      style={[styles.notice, warn ? styles.noticeWarning : styles.noticeDanger]}
    >
      <Icon name={icon} size={14} color={warn ? colors.warning : colors.danger} />
      <Text variant="captionStrong" color={tone} style={styles.shrink}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  bubble: { maxWidth: '82%', paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: BUBBLE_RADIUS },
  user: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: radius.sm / 2 + 2 },
  agentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, alignSelf: 'stretch' },
  avatar: { marginTop: space.xs },
  agent: { backgroundColor: colors.surfaceMuted, borderTopLeftRadius: radius.sm / 2 + 2, flexShrink: 1 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1, height: 21 },
  dot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.textTertiary },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  noticeDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerSoft },
});
