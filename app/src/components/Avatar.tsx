/**
 * @file Account avatar: an uploaded profile image, or the email's initial on a
 * lavender circle when there is none (or the image fails to load).
 */
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { colors, HIT } from '../theme';
import { Text } from './ui';

/**
 * Circle avatar: the uploaded image when `uri` is set, else the account initial.
 * @param props.email Account email; its initial shows when there is no image.
 * @param props.size Diameter in pt.
 * @param props.uri Uploaded image URL, or null/undefined for the initial.
 * @returns The avatar (decorative; label the parent).
 */
export function Avatar({ email, size, uri }: { email: string | null; size: number; uri?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const round = { width: size, height: size, borderRadius: size / 2 };
  const a11y = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  if (uri && !failed) {
    return <Image source={{ uri }} style={[styles.avatar, round]} onError={() => setFailed(true)} {...a11y} />;
  }
  return (
    <View style={[styles.avatar, round]} {...a11y}>
      <Text variant={size > HIT ? 'title' : 'bodyStrong'} color="primary">
        {(email?.[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoftBorder },
});
