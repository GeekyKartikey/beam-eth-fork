/**
 * @file Recipient block of the review card: ENS avatar (or initials), the
 * name with an ENS "Primary name" badge when the reverse check matched, the
 * full grouped address, and where the recipient was found.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { Intent } from '../intent';
import { ensAvatarUrl } from '../names';
import { colors, radius, space } from '../theme';
import { AddressText } from './AddressText';
import { EnsMark } from './logos';
import { IconTile, Text, type IconName } from './ui';

const AVATAR = 40;

/**
 * Where the recipient came from, as shown under the address.
 * @param intent Intent under review.
 * @returns Icon and source line.
 */
function sourceLine(intent: Intent): { icon: IconName; text: string } {
  if (intent.origin === 'mcp') return { icon: 'cpu', text: 'Requested by an outside agent' };
  const p = intent.provenance;
  const app = p.appLabel ?? 'another app';
  switch (p.source) {
    case 'screen':
      return { icon: 'smartphone', text: `Found on screen in ${app}` };
    case 'clipboard':
      return { icon: 'clipboard', text: 'From clipboard' };
    case 'user':
      return { icon: 'message-circle', text: 'From your message' };
    case 'both':
      return { icon: 'smartphone', text: `Found in ${app} and in your message` };
  }
}

/**
 * ENS avatar through the metadata service, falling back to the name's initial.
 * Never blocks: the initial shows until (and unless) the image loads.
 * @param props.name Normalized ENS name.
 * @returns A round avatar, hidden from screen readers.
 */
function EnsAvatar({ name }: { name: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {loaded ? null : (
        <Text variant="bodyStrong" color="primary">
          {name[0]?.toUpperCase() ?? '?'}
        </Text>
      )}
      {failed ? null : (
        <Image
          source={{ uri: ensAvatarUrl(name) }}
          style={[StyleSheet.absoluteFill, !loaded && styles.hidden]}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

/**
 * The recipient block.
 * @param props.intent Intent under review.
 * @returns The block.
 */
export function RecipientBlock({ intent }: { intent: Intent }) {
  const source = sourceLine(intent);
  const primary = !!intent.toName && !intent.warnings.includes('NAME_NOT_PRIMARY');
  return (
    <View style={styles.block}>
      {intent.toName ? <EnsAvatar name={intent.toName} /> : <IconTile icon="user" size={AVATAR} />}
      <View style={styles.text}>
        <Text variant="overline" color="textTertiary">
          To
        </Text>
        {intent.toName ? (
          <View style={styles.nameRow}>
            <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
              {intent.toName}
            </Text>
            {primary ? (
              <View style={styles.badge} accessible accessibilityLabel="ENS primary name">
                <EnsMark size={11} />
                <Text variant="caption" color="textSecondary">
                  Primary name
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <AddressText address={intent.to} />
        <View style={styles.inline}>
          <Feather name={source.icon} size={12} color={colors.textSecondary} />
          <Text variant="caption" color="textSecondary">
            {source.text}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoftBorder,
  },
  hidden: { opacity: 0 },
  text: { flex: 1, gap: space.xs },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  name: { flexShrink: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
});
