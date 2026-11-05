/**
 * @file Signed-in app shell: four tabs (Wallet, Activity, Beam, Profile)
 * sharing one `WalletDataProvider`, drawn with the floating capsule tab bar.
 * Signed out, the full-screen sign-in flow renders instead, with no tab bar.
 * Screens draw their own headers, so navigator headers are off.
 */
import { Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BeamGlyph } from '../../src/components/BrandMark';
import { FloatingTabBar } from '../../src/components/FloatingTabBar';
import { Icon } from '../../src/components/Icon';
import { SignIn } from '../../src/components/SignIn';
import type { IconName } from '../../src/components/ui';
import { useWallet } from '../../src/hooks';
import { colors } from '../../src/theme';
import { WalletDataProvider } from '../../src/walletData';

const TABS: { name: string; title: string; icon: IconName | 'beam' }[] = [
  { name: 'index', title: 'Wallet', icon: 'credit-card' },
  { name: 'activity', title: 'Activity', icon: 'clock' },
  { name: 'bubble', title: 'Beam', icon: 'beam' },
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
        tabBar={(props) => <FloatingTabBar {...props} visible={TABS.map((t) => t.name)} hiddenOn={[]} />}
        screenOptions={{
          headerShown: false,
          // Screens slide and fade into place when switching tabs.
          animation: 'shift',
          sceneStyle: styles.scene,
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({ color, focused }) =>
                tab.icon === 'beam' ? (
                  <BeamGlyph size={21} color={color} />
                ) : (
                  <Icon name={tab.icon} size={22} color={color} weight={focused ? 'fill' : 'regular'} />
                ),
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
});
