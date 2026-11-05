/**
 * @file Beam preference and app lifecycle glue.
 *
 * The beam is hidden while the app is in the foreground (so it never floats over
 * Beam itself) and shown again when the app goes to the background, if the user
 * enabled it. All calls no-op when the native module is missing (iOS, web, Expo Go).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { BubbleOverlay } from '../modules/bubble-overlay';

const ENABLED_KEY = 'bubbleEnabled:v1';

/**
 * Reads the user's "beam on" preference.
 * @returns True if the user started the beam and hasn't stopped it from the app.
 */
async function isBubbleEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
}

/**
 * Persists the user's "beam on" preference.
 * @param enabled New value.
 * @returns Resolves once stored.
 */
export async function setBubbleEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

/**
 * Handles one AppState transition.
 * Active: hide the beam, and restart its service if an aggressive OEM battery
 * manager killed it while the app was away.
 * Background: show the beam if enabled.
 * @param state New AppState.
 * @returns Resolves when handled.
 */
async function onAppStateChange(state: AppStateStatus): Promise<void> {
  const overlay = BubbleOverlay;
  if (!overlay) return;
  if (state === 'active') {
    overlay.hideBubble();
    if ((await isBubbleEnabled()) && !overlay.isBubbleRunning() && overlay.hasOverlayPermission()) {
      try {
        overlay.startBubble(); // Starts hidden; shown on the next background.
      } catch {
        // Overlay permission was revoked between the check and the call; the Beam tab shows the red row.
      }
    }
  } else if (state === 'background' && (await isBubbleEnabled()) && AppState.currentState === 'background') {
    // Re-check after the await so a quick return to the app doesn't leave the beam over it.
    overlay.showBubble();
  }
}

/**
 * Keeps the beam in sync with the app's foreground state. Call once in the root layout.
 * @returns Nothing; subscribes for the component's lifetime.
 */
export function useBubbleLifecycle(): void {
  useEffect(() => {
    if (!BubbleOverlay) return;
    void onAppStateChange(AppState.currentState);
    const sub = AppState.addEventListener('change', (state) => void onAppStateChange(state));
    return () => sub.remove();
  }, []);
}
