/**
 * @file Permission status and fix actions for the Beam tab setup checklist.
 *
 * `usePermissions()` snapshots every native permission plus the beam's
 * running state, and re-reads them whenever the app returns to the foreground
 * (the user usually fixes things in system settings).
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import { BubbleOverlay } from '../modules/bubble-overlay';

export type PermissionKey = 'overlay' | 'accessibility' | 'notifications' | 'battery';

export type PermissionStatus = {
  overlay: boolean;
  accessibility: boolean;
  /** Null below Android 13, where notifications need no runtime permission. */
  notifications: boolean | null;
  battery: boolean;
  bubbleRunning: boolean;
};

const NOTIFICATIONS = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
const HAS_NOTIFICATION_PERMISSION = Platform.OS === 'android' && Number(Platform.Version) >= 33;

/**
 * Reads all statuses from the native module.
 * @returns The snapshot, or null when the module is unavailable.
 */
async function readStatus(): Promise<PermissionStatus | null> {
  const overlay = BubbleOverlay;
  if (!overlay) return null;
  const notifications = HAS_NOTIFICATION_PERMISSION ? await PermissionsAndroid.check(NOTIFICATIONS) : null;
  return {
    overlay: overlay.hasOverlayPermission(),
    accessibility: overlay.isAccessibilityEnabled(),
    notifications,
    battery: overlay.isIgnoringBatteryOptimizations(),
    // Read last so a restart from the lifecycle hook on the same `active` tick is usually visible.
    bubbleRunning: overlay.isBubbleRunning(),
  };
}

/**
 * Opens the system flow that grants one permission. Notifications use the
 * runtime dialog, or app settings once the user chose "don't ask again".
 * @param key Permission to fix.
 * @returns Resolves when the dialog closes or settings were launched.
 */
export async function fixPermission(key: PermissionKey): Promise<void> {
  switch (key) {
    case 'overlay':
      return BubbleOverlay?.requestOverlayPermission();
    case 'accessibility':
      return BubbleOverlay?.openAccessibilitySettings();
    case 'battery':
      return BubbleOverlay?.requestIgnoreBatteryOptimizations();
    case 'notifications':
      if ((await PermissionsAndroid.request(NOTIFICATIONS)) === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        await Linking.openSettings();
      }
  }
}

/**
 * Live permission snapshot, refreshed on mount and on every AppState `active`.
 * @returns `status` (null while loading or when the native module is missing) and a manual `refresh`.
 */
export function usePermissions(): { status: PermissionStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const refresh = useCallback(() => {
    void readStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  return { status, refresh };
}
