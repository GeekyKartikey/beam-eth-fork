/**
 * @file Modal bottom sheet used by the tabs (Receive, limit editor):
 * fading scrim, spring-in panel, grab handle, title row with a close button.
 * Back button, scrim tap and the close button all call `onClose`.
 */
import { Icon } from './Icon';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, HIT, radius, shadow, space } from '../theme';
import { Text } from './ui';

const CLOSE_SIZE = 36;

/**
 * Bottom sheet.
 * @param props.visible Whether the sheet is shown; hiding animates out before unmounting.
 * @param props.onClose Called on back, scrim tap or the close button.
 * @param props.title Sheet title (announced as a header).
 * @param props.children Sheet body.
 * @returns A modal sheet, or nothing while fully hidden.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, { toValue: 1, damping: 26, stiffness: 260, overshootClamping: true, useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && setMounted(false),
      );
    }
  }, [visible, progress]);

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: insets.bottom + space.xl,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="headline" accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={(HIT - CLOSE_SIZE) / 2}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <Icon name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.lg,
    ...shadow.sheet,
  },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: HIT, marginTop: -space.sm },
  title: { flex: 1 },
  close: {
    width: CLOSE_SIZE,
    height: CLOSE_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  closePressed: { backgroundColor: colors.border },
});
