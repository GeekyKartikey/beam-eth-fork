/**
 * @file Hold-to-confirm button: the in-app approval used when no
 * biometric or device PIN is enrolled. A darker purple fill sweeps across the
 * button over 1.5 s; releasing early rewinds it.
 */
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { colors, radius, space } from '../theme';
import { Text } from './ui';

const HOLD_MS = 1500;

/**
 * Full-width primary button that fires after a continuous 1.5 s press.
 * @param props.disabled Blocks the gesture.
 * @param props.onComplete Called once the hold completes.
 * @returns The button.
 */
export function HoldButton({ disabled, onComplete }: { disabled: boolean; onComplete: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;

  const start = () => {
    void Haptics.selectionAsync();
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      progress.setValue(0);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onComplete();
    });
  };
  const release = () => Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: true }).start();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to confirm"
      accessibilityHint="Press and hold for one and a half seconds to send"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={start}
      onPressOut={release}
      style={[styles.button, disabled && styles.inactive]}
    >
      <Animated.View style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
      <Feather name="lock" size={16} color={colors.textInverse} />
      <Text variant="button" color="textInverse">
        Hold to confirm
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: radius.md + 2,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    overflow: 'hidden',
  },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.primaryPressed, transformOrigin: 'left' },
  inactive: { opacity: 0.4 },
});
