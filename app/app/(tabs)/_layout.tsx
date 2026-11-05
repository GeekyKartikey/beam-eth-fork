/**
 * @file Signed-in app shell: four bottom tabs (Wallet, Activity, Beam,
 * Profile) sharing one `WalletDataProvider`. Signed out, the full-screen
 * sign-in flow renders instead, with no tab bar. Screens draw their own
 * headers, so navigator headers are off.
 */
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SignIn } from '../../src/components/SignIn';
import type { IconName } from '../../src/components/ui';
import { useWallet } from '../../src/hooks';
import { colors, fonts } from '../../src/theme';
import { WalletDataProvider } from '../../src/walletData';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Wallet', icon: 'credit-card' },
  { name: 'activity', title: 'Activity', icon: 'clock' },
  { name: 'bubble', title: 'Beam', icon: 'circle' },
  { name: 'profile', title: 'Profile', icon: 'user' },
];

/**
 * Tabs layout with the auth gate.
 * @returns A spinner while Privy restores the session, the sign-in flow, or the tabs.
 */
export default function TabsLayout() {
  const { ready, user } = useWallet();

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <SignIn />;

  return (
    <WalletDataProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: styles.scene,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.label,
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({ color }) => <Feather name={tab.icon} size={22} color={color} />,
            }}
          />
        ))}
      </Tabs>
    </WalletDataProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  scene: { backgroundColor: colors.canvas },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowOpacity: 0,
  },
  label: { fontFamily: fonts.medium, fontSize: 11 },
});
