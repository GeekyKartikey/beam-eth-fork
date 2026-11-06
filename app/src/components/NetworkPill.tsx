/**
 * @file Network badge: the Arc mark beside a network name.
 *
 * Read-only by default, showing the build's payment network (`NETWORK`), used in
 * the Ask and review sheets and Profile where money actually moves. With
 * `toggle`, it becomes the Wallet's testnet/mainnet switcher: tapping flips the
 * network the Wallet balance is shown for. Display only; payments never use it.
 */
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { NETWORK } from '../config';
import { colors, radius, space } from '../theme';
import { useViewNetwork } from '../viewNetwork';
import { Icon } from './Icon';
import { ArcMark } from './logos';
import { Text } from './ui';

const MARK = 12;

/**
 * Official Arc mark.
 * @param props.size Height in dp.
 * @returns An SVG element, hidden from screen readers.
 */
export function NetworkMark({ size }: { size: number }) {
  return <ArcMark size={size} />;
}

/**
 * Soft pill with the Arc mark and a network name.
 * @param props.toggle When set, shows the Wallet's view network and flips testnet/mainnet on tap.
 * @returns A read-only badge, or a switcher when `toggle` is set.
 */
export function NetworkPill({ toggle }: { toggle?: boolean } = {}) {
  const [view, flip] = useViewNetwork();
  if (!toggle) {
    return (
      <View style={styles.pill} accessible accessibilityLabel={NETWORK.name}>
        <NetworkMark size={MARK} />
        <Text variant="captionStrong" color="primary">
          {NETWORK.name}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${view.name}. Switch to ${view.testnet ? 'mainnet' : 'testnet'}`}
      hitSlop={space.xs}
      onPress={() => {
        void Haptics.selectionAsync();
        flip();
      }}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
    >
      <NetworkMark size={MARK} />
      <Text variant="captionStrong" color="primary">
        {view.name}
      </Text>
      <Icon name="chevron-down" size={14} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  pressed: { opacity: 0.7 },
});
