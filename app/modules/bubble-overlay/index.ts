/**
 * @file Typed JS API for the local `bubble-overlay` Expo module (Android only).
 *
 * `BubbleOverlay` is null on iOS/web and in Expo Go (module not linked), so
 * every caller guards with `BubbleOverlay?.…`. Kotlin lives in `android/`.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Text captured from the foreground app at the moment the beam was tapped. */
export type ScreenContext = {
  id: string;
  packageName: string;
  /** Best effort; falls back to packageName. */
  appLabel: string;
  /** Epoch ms. */
  capturedAt: number;
  /** At most 4000 chars. Empty when the app exposes no text. */
  text: string;
  truncated: boolean;
  nodeCount: number;
};

export interface BubbleOverlayApi {
  hasOverlayPermission(): boolean;
  /** Opens the system "Display over other apps" screen for this app. */
  requestOverlayPermission(): void;
  isAccessibilityEnabled(): boolean;
  openAccessibilitySettings(): void;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): void;
  /** Starts the foreground service. Throws `E_NO_OVERLAY_PERMISSION` without the permission. */
  startBubble(): void;
  stopBubble(): void;
  showBubble(): void;
  hideBubble(): void;
  isBubbleRunning(): boolean;
  /** Returns the context once, then deletes it. Null if unknown or older than 120 s. */
  consumeScreenContext(id: string): ScreenContext | null;
  /** `moveTaskToBack(true)` on the current activity. */
  minimizeApp(): void;
  /** Opens the system speech dialog. Resolves with what was said, or null if cancelled. */
  listen(): Promise<string | null>;
}

export const BubbleOverlay: BubbleOverlayApi | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<BubbleOverlayApi>('BubbleOverlay') : null;
