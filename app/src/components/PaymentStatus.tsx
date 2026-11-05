/**
 * @file Execution status block for the payment card: replaces the
 * Confirm/Cancel buttons once a payment is in flight or settled, with the
 * transaction hash and explorer link where one exists.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Linking, StyleSheet, View } from 'react-native';
import { NETWORK } from '../config';
import type { ExecState } from '../execute';
import { shortAddress } from '../intent';
import { txUrl } from '../network';
import { colors, radius, space } from '../theme';
import { Button, Text, type IconName, type Tone } from './ui';

const BADGE = 56;

type Badge = { icon: IconName; tone: Extract<Tone, 'success' | 'warning' | 'danger'> } | 'spinner';

const BADGE_BG: Record<Exclude<Badge, 'spinner'>['tone'], string> = {
  success: colors.successSoft,
  warning: colors.warningSoft,
  danger: colors.dangerSoft,
};

/**
 * Round state badge: spinner, or an icon in a soft tinted circle that scales in.
 * @param props.badge What to show.
 * @returns The badge.
 */
function StateBadge({ badge }: { badge: Badge }) {
  const scale = useRef(new Animated.Value(badge === 'spinner' ? 1 : 0.6)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, damping: 12, stiffness: 220, useNativeDriver: true }).start();
  }, [scale]);

  if (badge === 'spinner') {
    return (
      <View style={[styles.badge, styles.spinnerBadge]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  return (
    <Animated.View style={[styles.badge, { backgroundColor: BADGE_BG[badge.tone], transform: [{ scale }] }]}>
      <Feather name={badge.icon} size={26} color={colors[badge.tone]} />
    </Animated.View>
  );
}

/**
 * Centered status layout shared by every state.
 * @param props.badge Leading badge.
 * @param props.title Main line.
 * @param props.detail Secondary line (reason, hint or hash).
 * @param props.mono Render the detail in monospace.
 * @param props.big Larger title (the success moment).
 * @param props.children Actions under the text.
 * @returns The block, announced politely as it changes.
 */
function Block({
  badge,
  title,
  detail,
  mono,
  big,
  children,
}: {
  badge: Badge;
  title: string;
  detail?: string;
  mono?: boolean;
  big?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <StateBadge key={badge === 'spinner' ? badge : badge.icon} badge={badge} />
      <View style={styles.text}>
        <Text variant={big ? 'title' : 'headline'} align="center" style={styles.tabular}>
          {title}
        </Text>
        {detail ? (
          <Text variant={mono ? 'mono' : 'callout'} color="textSecondary" align="center">
            {detail}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

/**
 * In-flight and terminal states with explorer links.
 * @param props.state Execution state (renders nothing for idle/cancelled).
 * @param props.onCheckAgain Re-checks the receipt after a timeout.
 * @returns The status block, or null.
 */
export function PaymentStatus({ state, onCheckAgain }: { state: ExecState; onCheckAgain: () => void }) {
  const hash = 'hash' in state ? state.hash : null;
  const explorer = hash ? (
    <Button size="sm" variant="secondary" icon="external-link" label="View on explorer" onPress={() => void Linking.openURL(txUrl(NETWORK, hash))} />
  ) : null;

  switch (state.status) {
    case 'confirming':
      return <Block badge="spinner" title="Waiting for your approval…" detail="Use your fingerprint or PIN" />;
    case 'signing':
      return <Block badge="spinner" title="Signing and sending…" />;
    case 'submitted':
      return (
        <Block badge="spinner" title="Submitted" detail={shortAddress(state.hash)} mono>
          {explorer}
        </Block>
      );
    case 'confirmed':
      return (
        <Block
          badge={{ icon: 'check', tone: 'success' }}
          title={state.ms === null ? 'Confirmed.' : `Confirmed in ${state.ms} ms.`}
          detail={shortAddress(state.hash)}
          mono
          big
        >
          {explorer}
        </Block>
      );
    case 'failed':
      return (
        <Block badge={{ icon: 'x', tone: 'danger' }} title="Payment failed" detail={state.reason}>
          {explorer}
        </Block>
      );
    case 'pending_timeout':
      return (
        <Block badge={{ icon: 'clock', tone: 'warning' }} title="Still pending" detail={`${NETWORK.name} hasn't confirmed it yet.`}>
          <Button size="sm" variant="primary" icon="refresh-cw" label="Check again" onPress={onCheckAgain} />
          {explorer}
        </Block>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  badge: { width: BADGE, height: BADGE, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  spinnerBadge: { backgroundColor: colors.primarySoft },
  text: { alignItems: 'center', gap: space.xxs },
  tabular: { fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm },
});
