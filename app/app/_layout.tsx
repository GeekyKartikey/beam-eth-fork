/**
 * @file Root layout: fonts (splash held until loaded), Privy with the
 * embedded EVM wallet on the build's network (`NETWORK`), beam lifecycle, and
 * the route stack: the opaque `(tabs)` group (Wallet, Activity, Beam, Profile,
 * or the sign-in flow while signed out) and two transparent sheets over other
 * apps: `ask` (opened by the beam) and `review` (a payment link from an
 * external agent).
 *
 * Deep links: expo-router maps `bubbleagent://ask?ctx=...` to `/ask` and
 * `bubbleagent://review?p=...` to `/review` on both cold start (initial URL)
 * and warm start (URL event, NAVIGATE). The sheet collapses the warm-start
 * stack to itself, so there is no extra Linking handling here and no double
 * navigation. `/` resolves to `(tabs)/index`, the Wallet tab. World App
 * return links are kept out of the router by `+native-intent.tsx`.
 */
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { RobotoMono_400Regular, RobotoMono_500Medium, RobotoMono_600SemiBold } from '@expo-google-fonts/roboto-mono';
import { Icon } from '../src/components/Icon';
import { PrivyProvider } from '@privy-io/expo';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBubbleLifecycle } from '../src/bubble';
import { Card, Text } from '../src/components/ui';
import { chain, config } from '../src/config';
import { colors, radius, space } from '../src/theme';

void SplashScreen.preventAutoHideAsync();

const PRIVY_CONFIGURED = !!config.privyAppId && !!config.privyClientId;
const SHEET = { contentStyle: { backgroundColor: 'transparent' }, animation: 'none' } as const;

/**
 * App root.
 * @returns Providers and the route stack, or a setup screen when Privy env is missing.
 */
export default function RootLayout() {
  useBubbleLifecycle();
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    RobotoMono_400Regular,
    RobotoMono_500Medium,
    RobotoMono_600SemiBold,
  });
  // A font failure falls back to system fonts rather than holding the splash forever.
  const ready = loaded || !!error;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="dark" />
      {PRIVY_CONFIGURED ? (
        <PrivyProvider
          appId={config.privyAppId}
          clientId={config.privyClientId}
          supportedChains={[chain]}
          config={{ embedded: { ethereum: { createOnLogin: 'users-without-wallets' } } }}
        >
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ contentStyle: { backgroundColor: colors.canvas } }} />
            {/* The sheets animate themselves (scrim fade + spring), so the screen transition is off. */}
            <Stack.Screen name="ask" options={SHEET} />
            <Stack.Screen name="review" options={SHEET} />
            <Stack.Screen name="agents" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </PrivyProvider>
      ) : (
        <ConfigMissing />
      )}
    </>
  );
}

/**
 * Shown when the Privy env vars are missing from the build.
 * @returns A centered setup card.
 */
function ConfigMissing() {
  return (
    <View style={styles.missing}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Icon name="settings" size={20} color={colors.primary} />
        </View>
        <Text variant="headline">Almost there</Text>
        <Text variant="callout" color="textSecondary">
          Beam needs your Privy app credentials. Add these to app/.env, then rebuild the app.
        </Text>
        <View style={styles.vars}>
          <Text variant="mono">EXPO_PUBLIC_PRIVY_APP_ID</Text>
          <Text variant="mono">EXPO_PUBLIC_PRIVY_CLIENT_ID</Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { flex: 1, justifyContent: 'center', padding: space.xl, backgroundColor: colors.canvas },
  card: { gap: space.md, padding: space.xxl, borderRadius: radius.xl },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vars: { gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
});
