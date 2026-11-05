/**
 * @file Account avatar: the email's initial on a lavender circle.
 */
import { StyleSheet, View } from 'react-native';
import { colors, HIT } from '../theme';
import { Text } from './ui';

/**
 * Circle with the account's initial.
 * @param props.email Account email; shows "?" when unknown.
 * @param props.size Diameter in pt.
 * @returns The avatar (decorative; label the parent).
 */
export function Avatar({ email, size }: { email: string | null; size: number }) {
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text variant={size > HIT ? 'title' : 'bodyStrong'} color="primary">
        {(email?.[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoftBorder },
});
