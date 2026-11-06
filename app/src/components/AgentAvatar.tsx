/**
 * @file Avatar for a connected agent: its brand logo (Claude, Codex, Cursor,
 * Gemini, Copilot, Perplexity, Windsurf) on a soft tile, otherwise its initial.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, radius } from '../theme';
import { brandFor, type AgentBrand } from './agentLogos';
import { Text } from './ui';

/**
 * A brand logo alone.
 * @param props.brand Brand to draw.
 * @param props.size Edge in dp.
 * @returns An SVG, hidden from screen readers.
 */
export function BrandLogo({ brand, size }: { brand: AgentBrand; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={brand.path} fill={brand.color} />
    </Svg>
  );
}

/**
 * Agent avatar tile.
 * @param props.name Agent name as the user labelled it.
 * @param props.size Tile edge in dp (default 40).
 * @returns The tile.
 */
export function AgentAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const brand = brandFor(name);
  return (
    <View
      style={[styles.tile, { width: size, height: size, backgroundColor: brand?.tile ?? colors.surfaceMuted }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {brand ? (
        <BrandLogo brand={brand} size={size * 0.56} />
      ) : (
        <Text variant="bodyStrong" color="textSecondary">
          {name.trim().charAt(0).toUpperCase() || '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
