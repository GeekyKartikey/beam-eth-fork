/**
 * @file Floating tab bar: a flat white capsule with a border, above the bottom edge.
 * The active tab is a black pill with its icon and label; the others are icons.
 * Hidden on full-screen routes (the Ask chat, Activity), which have their own
 * way back.
 */
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, space } from '../theme';
import { Text } from './ui';

/** Capsule height. */
const BAR_HEIGHT = 64;
/** Gap between the capsule and the bottom inset. */
const BAR_GAP = space.md;

/**
 * Space a scrolling screen leaves at its bottom so the last row clears the bar.
 * @param bottomInset Safe-area bottom inset.
 * @returns Padding in dp.
 */
export const tabBarSpace = (bottomInset: number) => BAR_HEIGHT + BAR_GAP + bottomInset + space.lg;

/**
 * The bar. Pass as `tabBar` to expo-router's `Tabs`.
 * @param props.visible Route names that get a button, in order.
 * @param props.hiddenOn Route names where the bar is not shown at all.
 * @returns The floating capsule, or null on a hidden route.
 */
export function FloatingTabBar({
  state,
  descriptors,
  navigation,
  insets,
  visible,
  hiddenOn,
}: BottomTabBarProps & { visible: string[]; hiddenOn: string[] }) {
  const current = state.routes[state.index];
  if (!current || hiddenOn.includes(current.name)) return null;
  const routes = visible.flatMap((name) => state.routes.filter((r) => r.name === name));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + BAR_GAP }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {routes.map((route) => {
          const { options } = descriptors[route.key] ?? { options: {} };
          const focused = route.key === current.key;
          const label = typeof options.title === 'string' ? options.title : route.name;
          const color = focused ? colors.textInverse : colors.textTertiary;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              void Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              style={({ pressed }) => [styles.item, focused && styles.itemActive, pressed && !focused && styles.itemPressed]}
            >
              {options.tabBarIcon?.({ focused, color, size: 22 })}
              {focused ? (
                <Text variant="captionStrong" color="textInverse" numberOfLines={1}>
                  {label}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.xl, right: space.xl, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    height: BAR_HEIGHT,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    // Flat by design: a crisp border instead of a shadow.
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: BAR_HEIGHT - space.lg,
    minWidth: BAR_HEIGHT - space.lg,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  itemActive: { backgroundColor: colors.primary, paddingHorizontal: space.lg },
  itemPressed: { backgroundColor: colors.surfaceMuted },
});
