/**
 * @file Wallet tab: minimal header (Beam mark and wordmark, network badge,
 * profile shortcut), setup problems, the balance card with the onchain cap and
 * quick actions, the pending-payment banner and the three latest payments.
 * Pull to refresh.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityList } from '../../src/components/ActivityList';
import { Avatar } from '../../src/components/Avatar';
import { BalanceCard } from '../../src/components/BalanceCard';
import { PendingBanner, SetupBanner } from '../../src/components/Banner';
import { BrandMark } from '../../src/components/BrandMark';
import { NetworkPill } from '../../src/components/NetworkPill';
import { Screen } from '../../src/components/Screen';
import { Card, ListRow, SectionHeader, Text } from '../../src/components/ui';
import { Icon } from '../../src/components/Icon';
import { EnsMark } from '../../src/components/logos';
import { money } from '../../src/components/format';
import { NETWORK } from '../../src/config';
import { colors, HIT, radius, space } from '../../src/theme';
import { useWalletData } from '../../src/walletData';
import { useAvatarUri } from '../../src/avatar';

/** Payments shown before "See all". */
const RECENT = 3;
const AVATAR = 36;

/**
 * Wallet screen.
 * @returns The scrollable wallet overview.
 */
export default function WalletScreen() {
  const { address, email, balance, balanceError, account, handle, server, pending, recheckPending, activity, limits, refresh } = useWalletData();
  const { uri: avatarUri } = useAvatarUri(address);

  const header = (
    <View style={styles.header}>
      <BrandMark size={28} />
      <Text variant="headline" accessibilityRole="header" style={styles.flex}>
        Beam
      </Text>
      <NetworkPill toggle />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        onPress={() => router.navigate('/profile')}
        hitSlop={(HIT - AVATAR) / 2}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <Avatar email={email} size={AVATAR} uri={avatarUri} />
      </Pressable>
    </View>
  );

  return (
    <Screen header={header} onRefresh={refresh}>
      <View style={styles.top}>
        <SetupBanner server={server} />
        {handle === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Claim your ENS handle"
            onPress={() => router.navigate('/profile')}
            style={({ pressed }) => [styles.ensBanner, pressed && styles.pressed]}
          >
            <EnsMark size={30} />
            <View style={styles.flex}>
              <Text variant="bodyStrong">Claim your ENS</Text>
              <Text variant="caption" color="textSecondary">
                Get a free name like you.beamfi.eth, so people can pay you by name.
              </Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>
        ) : null}
        <BalanceCard address={address} balance={balance} balanceError={balanceError} cap={account?.cap ?? null} handle={handle} />
        <PendingBanner status={pending} onRecheck={recheckPending} />
      </View>
      {limits ? (
        <View>
          <SectionHeader title="Spending limit" />
          <Card>
            <ListRow
              icon="shield"
              tone="neutral"
              title={`${limits.daily} ${NETWORK.symbol} daily`}
              subtitle={`${money(limits.remainingWei)} left today`}
              onPress={() => router.navigate('/profile')}
            />
          </Card>
        </View>
      ) : null}
      <View>
        <SectionHeader title="Recent activity" action={{ label: 'See all', onPress: () => router.navigate('/activity') }} />
        <ActivityList items={activity} pending={pending} limit={RECENT} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: HIT },
  flex: { flex: 1 },
  avatar: { marginLeft: space.xs },
  pressed: { opacity: 0.7 },
  top: { gap: space.md },
  ensBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primarySoftBorder,
  },
});
