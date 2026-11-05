/**
 * @file Copy-to-clipboard with a light haptic and a short "Copied" state.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';

/** How long the "Copied" confirmation stays visible. */
const COPIED_MS = 1500;

/**
 * Clipboard writer with transient feedback state.
 * @returns `copied` (true briefly after a copy) and `copy(text)`.
 */
export function useCopy(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCopied(true);
  }, []);

  return { copied, copy };
}
