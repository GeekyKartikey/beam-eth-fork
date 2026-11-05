/**
 * @file Tab screen scaffold: opaque canvas (the window is translucent),
 * safe-area top padding, 20-pt gutters, 24-pt section spacing, an optional
 * large title or custom header, and optional pull to refresh.
 */
import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBarSpace } from './FloatingTabBar';
import { colors, space } from '../theme';
import { Text } from './ui';

/**
 * Scrollable tab screen.
 * @param props.title Large title, announced as a header (omit when `header` is given).
 * @param props.subtitle Short line under the title.
 * @param props.header Custom header row, used instead of the title.
 * @param props.onRefresh Enables pull to refresh; the spinner shows until it resolves.
 * @param props.children Screen sections.
 * @returns The screen.
 */
export function Screen({
  title,
  subtitle,
  header,
  onRefresh,
  children,
}: {
  title?: string;
  subtitle?: string;
  header?: ReactNode;
  onRefresh?: () => Promise<void>;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const pull = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    await onRefresh().finally(() => setRefreshing(false));
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.md, paddingBottom: tabBarSpace(insets.bottom) }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void pull()} colors={[colors.primary]} tintColor={colors.primary} />
        ) : undefined
      }
    >
      {header ??
        (title ? (
          <View style={styles.titleBlock}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="callout" color="textSecondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null)}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flexGrow: 1, paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.xxl },
  titleBlock: { gap: space.xs, minHeight: 48, justifyContent: 'center' },
});
