/**
 * @file Beam tab main card: on/off toggle for the floating beam.
 *
 * Persists the user's choice with `setBubbleEnabled`, and is disabled with an
 * explanation (and a shortcut to grant it) while the overlay permission is
 * missing. Renders nothing without the native module.
 */
import { Icon } from './Icon';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BubbleOverlay } from '../../modules/bubble-overlay';
import { setBubbleEnabled } from '../bubble';
import { fixPermission, type PermissionStatus } from '../permissions';
import { colors, radius, space } from '../theme';
import { BrandMark } from './BrandMark';
import { Button, Card, Text, type IconName } from './ui';

const NO_OVERLAY_MESSAGE = 'Allow "Display over other apps" to turn on the beam.';

const TIPS: { icon: IconName; label: string }[] = [
  { icon: 'mouse-pointer', label: 'Tap to ask' },
  { icon: 'move', label: 'Drag to move' },
  { icon: 'x-circle', label: 'Hold to stop' },
];

/**
 * Beam on/off card.
 * @param props.status Permission snapshot (includes whether the service runs); null while loading.
 * @param props.refresh Re-reads the snapshot.
 * @returns The card, or null when the native module is unavailable or status is loading.
 */
export function BubbleCard({ status, refresh }: { status: PermissionStatus | null; refresh: () => void }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with the real service state on every refresh (mount and AppState `active`).
  useEffect(() => {
    if (status) setRunning(status.bubbleRunning);
  }, [status]);

  const overlay = BubbleOverlay;
  if (!overlay || !status) return null;

  /** Starts or stops the service and stores the preference; the service starts and stops asynchronously, so state is set optimistically. */
  const toggle = async (on: boolean) => {
    setError(null);
    if (!on) {
      overlay.stopBubble();
      setRunning(false);
      await setBubbleEnabled(false);
      return;
    }
    try {
      overlay.startBubble();
      setRunning(true);
      await setBubbleEnabled(true);
    } catch (e) {
      const noPermission = (e as { code?: string }).code === 'E_NO_OVERLAY_PERMISSION';
      setError(noPermission ? NO_OVERLAY_MESSAGE : 'Couldn’t start the beam. Try again.');
      refresh();
    }
  };

  const blocked = !running && !status.overlay;

  return (
    <Card style={styles.card}>
      <View style={styles.main}>
        <BrandMark size={44} />
        <View style={styles.text}>
          <Text variant="bodyStrong">Floating beam</Text>
          <Text variant="caption" color={running ? 'success' : 'textSecondary'}>
            {running ? 'Active over other apps' : 'Off'}
          </Text>
        </View>
      </View>
      <Button
        variant={running ? 'secondary' : 'primary'}
        label={running ? 'Turn off' : 'Turn on'}
        accessibilityLabel={running ? 'Turn off the floating beam' : 'Turn on the floating beam'}
        onPress={() => void toggle(!running)}
        disabled={blocked}
      />

      {blocked ? (
        <View style={styles.notice}>
          <Icon name="lock" size={14} color={colors.warning} />
          <Text variant="caption" color="textSecondary" style={styles.flex}>
            {NO_OVERLAY_MESSAGE}
          </Text>
          <Button size="sm" label="Allow" accessibilityLabel="Allow display over other apps" onPress={() => void fixPermission('overlay').then(refresh)} />
        </View>
      ) : null}
      {error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={styles.tips} accessible accessibilityLabel={TIPS.map((t) => t.label).join(', ')}>
        {TIPS.map((tip) => (
          <View key={tip.label} style={styles.tip}>
            <Icon name={tip.icon} size={13} color={colors.textTertiary} />
            <Text variant="caption" color="textTertiary" numberOfLines={1}>
              {tip.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.lg },
  flex: { flex: 1 },
  main: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  text: { flex: 1, gap: space.xxs },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  tips: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
});
