/**
 * @file Network badge: the active network's official mark beside its name,
 * used in the Wallet header, the Ask sheet header and Profile so the network
 * reads the same everywhere.
 */
import { StyleSheet, View } from 'react-native';
import { NETWORK } from '../config';
import { colors, radius, space } from '../theme';
import { ArcMark } from './logos';
import { Text } from './ui';

const MARK = 12;

/**
 * Official mark of the active network: Arc in its navy.
 * @param props.size Height in dp.
 * @returns An SVG element, hidden from screen readers.
 */
export function NetworkMark({ size }: { size: number }) {
  return <ArcMark size={size} />;
}

/**
 * Soft pill with the network mark and name, e.g. "Arc Testnet".
 * @returns The badge, announced as one element.
 */
export function NetworkPill() {
  return (
    <View style={styles.pill} accessible accessibilityLabel={NETWORK.name}>
      <NetworkMark size={MARK} />
      <Text variant="captionStrong" color="primary">
        {NETWORK.name}
      </Text>
    </View>
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
});
