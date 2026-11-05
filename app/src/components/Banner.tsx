/**
 * @file Inline status banner with optional actions, plus the pending-payment
 * and setup banners shared by the Wallet tab and the Ask sheet. Tones map to
 * the semantic palette only.
 */
import type { ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { config, NETWORK } from '../config';
import { shortAddress } from '../intent';
import { txUrl } from '../network';
import type { PendingStatus } from '../pendingTx';
import { BEAMPAY_MISSING } from '../prepare';
import type { ServerStatus } from '../serverApi';
import { money } from './format';
import { colors, radius, space } from '../theme';
import { Button, IconTile, Text, type IconName } from './ui';

type Tone = 'neutral' | 'warning' | 'danger';

const TONES: Record<Tone, { bg: string; border: string; fg: 'text' | 'warning' | 'danger' }> = {
  neutral: { bg: colors.surface, border: colors.border, fg: 'text' },
  warning: { bg: colors.warningSoft, border: colors.warningBorder, fg: 'warning' },
  danger: { bg: colors.dangerSoft, border: colors.dangerSoft, fg: 'danger' },
};

/**
 * Banner row: tinted icon tile, text and trailing actions.
 * @param props.tone Semantic tone.
 * @param props.icon Feather icon name.
 * @param props.title Bold first line.
 * @param props.body Optional secondary line.
 * @param props.children Optional actions (small buttons), shown on the right.
 * @returns A banner view announced as an alert.
 */
function Banner({
  tone,
  icon,
  title,
  body,
  children,
}: {
  tone: Tone;
  icon: IconName;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <View accessibilityRole="alert" style={[styles.row, { backgroundColor: t.bg, borderColor: t.border }]}>
      <IconTile icon={icon} tone={tone} size={32} />
      <View style={styles.text}>
        <Text variant="captionStrong" color={t.fg}>
          {title}
        </Text>
        {body ? (
          <Text variant="caption" color="textSecondary">
            {body}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Pending-payment banner. Renders nothing unless the slot is pending or unknown.
 * @param props.status Result of `checkPending`.
 * @param props.onRecheck Re-checks the receipt.
 * @returns A banner, or null.
 */
export function PendingBanner({ status, onRecheck }: { status: PendingStatus; onRecheck: () => void }) {
  if (status.kind === 'pending') {
    return (
      <Banner
        tone="warning"
        icon="clock"
        title={`Payment pending · ${money(BigInt(status.tx.amountWei))}`}
        body={`To ${status.tx.toName ?? shortAddress(status.tx.to)}. Waiting for ${NETWORK.name}.`}
      >
        <Button size="sm" variant="secondary" label="Check" accessibilityLabel="Check payment again" onPress={onRecheck} />
      </Banner>
    );
  }
  if (status.kind === 'unknown') {
    const { hash } = status.tx;
    return (
      <Banner tone="neutral" icon="help-circle" title="Unknown, check explorer" body="Your last payment didn't confirm in 10 minutes.">
        <Button
          size="sm"
          variant="secondary"
          label="View"
          icon="external-link"
          accessibilityLabel="View payment on explorer"
          onPress={() => void Linking.openURL(txUrl(NETWORK, hash))}
        />
      </Banner>
    );
  }
  return null;
}

/**
 * Setup problems that block payments or the agent: BeamPay not configured, or
 * the server on a different network. Renders nothing when all is well.
 * @param props.server Server status from `/health`.
 * @returns A danger banner, or null.
 */
export function SetupBanner({ server }: { server: ServerStatus }) {
  if (!config.beamPay) {
    return <Banner tone="danger" icon="tool" title={BEAMPAY_MISSING} body="Payments are off until this build has an BeamPay address." />;
  }
  if (server.kind === 'mismatch') {
    return (
      <Banner tone="danger" icon="alert-triangle" title="Server is on a different network." body="The agent is off. The basic parser still works." />
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: space.xxs },
});
