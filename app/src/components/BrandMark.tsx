/**
 * @file Brand mark: the Beam mark (the app's own logo). Flat colours only,
 * no gradients or glows.
 *
 * The Beam glyph is a thick ring with a small solid dot orbiting on its path at
 * the upper right, drawn on a 24-unit grid. The same path lives in
 * `assets/brand/beam-glyph.svg`, `assets/brand/beam-mark.svg`, the Android
 * overlay drawables (`bubble_icon.xml`, `ic_stat_bubble.xml`) and the app icon
 * renders. Keep them in sync.
 */
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Beam glyph on a 24 x 24 grid: a ring (outer r 9.5, stroke 3.2, ~17% of its
 * diameter) concentric with the grid, cut around a solid dot (r 2.6) that rides
 * the ring's path at 45 degrees upper right, with a 1.4-unit gap.
 */
const BEAM_PATH =
  'M20.894 8.662A9.5 9.5 0 1 1 15.338 3.106A4 4 0 0 0 13.618 5.911A6.3 6.3 0 1 0 18.089 10.382A4 4 0 0 0 20.894 8.662ZM20.186 6.414A2.6 2.6 0 1 1 14.986 6.414A2.6 2.6 0 1 1 20.186 6.414Z';
const BEAM_GRID = 24;

/** Tile geometry on a 100-unit grid: corner radius (~30%) and glyph box (ring ~52% of the tile, as on the app icon). */
const TILE = 100;
const TILE_RADIUS = 30;
const GLYPH_SIZE = 66;

/** Marks are decorative; label the parent instead. */
const A11Y_HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

/**
 * Beam logo mark.
 * @param props.size Edge length in dp; the mark is square.
 * @param props.variant `color` (default): white Beam glyph on a flat primary
 *   rounded tile (radius ~30% of size), for light surfaces. `white`: the white
 *   glyph alone, filling the box, for primary or ink surfaces.
 * @returns An SVG element, hidden from screen readers.
 */
export function BrandMark({ size, variant = 'color' }: { size: number; variant?: 'color' | 'white' }) {
  if (variant === 'white') {
    return (
      <Svg width={size} height={size} viewBox={`0 0 ${BEAM_GRID} ${BEAM_GRID}`} {...A11Y_HIDDEN}>
        <Path d={BEAM_PATH} fill={colors.textInverse} fillRule="evenodd" />
      </Svg>
    );
  }
  const offset = (TILE - GLYPH_SIZE) / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${TILE} ${TILE}`} {...A11Y_HIDDEN}>
      <Rect width={TILE} height={TILE} rx={TILE_RADIUS} fill={colors.primary} />
      <Path d={BEAM_PATH} x={offset} y={offset} scale={GLYPH_SIZE / BEAM_GRID} fill={colors.textInverse} fillRule="evenodd" />
    </Svg>
  );
}

/**
 * Beam glyph alone, for icon slots (tab bar).
 * @param props.size Edge length in dp.
 * @param props.color Fill colour.
 * @returns An SVG element, hidden from screen readers.
 */
export function BeamGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${BEAM_GRID} ${BEAM_GRID}`} {...A11Y_HIDDEN}>
      <Path d={BEAM_PATH} fill={color} fillRule="evenodd" />
    </Svg>
  );
}
