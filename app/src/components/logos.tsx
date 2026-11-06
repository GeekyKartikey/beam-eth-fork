/**
 * @file Official partner logomarks: Arc (network pill), World (World ID
 * approval rows and buttons) and ENS (the primary-name badge). Same API
 * everywhere: `{ size, color? }`, height-driven, hidden from screen readers.
 *
 * Path data is copied verbatim from each brand kit; only the colour is chosen,
 * from the kit's own variants. Do not redraw or recolour outside them.
 * - Arc: Circle brand kit (https://www.circle.com/pressroom#brandkit), archive
 *   https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Brand/Arc/Arc_Logos.zip,
 *   `Arc_Logos/Icon/SVG/Arc_Icon_Navay.svg` (flat navy icon, viewBox 0 0 164 171).
 * - World: https://world.org/brand, "Logomark" archive,
 *   `Logomark/Logomark (Digital _ RGB)/Logomark-Off Black/SVG` (viewBox 0 0 1024 1024,
 *   cropped to the mark's 237..787 bounds; the path is untouched).
 * - ENS: https://ens.domains/brand, https://ens.domains/assets/brand/mark/ens-mark-Blue.svg
 *   (ENS Blue symbol, viewBox 0 0 202 231).
 */
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme';

const A11Y_HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

const ARC_W = 164;
const ARC_H = 171;
const ARC_PATH =
  'M0 171C1.39327 129.136 8.52567 90.067 20.4481 59.6871C35.5477 21.1972 57.4057 0 81.9919 0C106.578 0 128.433 21.1972 143.536 59.6871C151.391 79.7058 157.17 103.491 160.594 129.366C160.9 131.677 161.161 134.026 161.428 136.369C161.515 136.514 161.568 136.649 161.55 136.758C161.55 136.758 163.562 149.265 163.99 171H163.763C160.778 168.562 125.578 141.038 67.2282 149.007C68.1086 139.181 69.3194 129.62 70.8835 120.456C70.9634 119.987 71.0558 119.535 71.1373 119.07C94.0233 118.383 114.055 121.028 129.416 124.494C129.359 124.131 129.311 123.758 129.253 123.397C126.095 103.83 121.437 85.9161 115.43 70.6073C105.61 45.576 92.7953 30.0239 81.9919 30.0239C71.189 30.0239 58.3744 45.576 48.554 70.6073C46.1769 76.6621 44.0128 83.1192 42.0721 89.9301C39.3438 99.4735 37.0517 109.704 35.2212 120.455C32.5117 136.331 30.8189 153.358 30.1954 171H0Z';

/** The World mark sits at 237..787 inside its 1024 artboard; this viewBox crops the padding only. */
const WORLD_BOX = '237 237 550 550';
const WORLD_PATH =
  'M649.8,273.99c-42.16-24.65-88.09-36.99-137.8-36.99s-95.65,12.33-137.8,36.99c-42.16,24.66-75.56,58.07-100.22,100.22-24.66,42.16-36.99,88.09-36.99,137.8s12.32,95.65,36.99,137.8c24.65,42.15,58.06,75.55,100.22,100.22,42.15,24.65,88.08,36.98,137.8,36.98s95.64-12.33,137.8-36.98c42.15-24.66,75.55-58.07,100.22-100.22,24.65-42.15,36.99-88.08,36.99-137.8s-12.33-95.64-36.99-137.8c-24.66-42.15-58.07-75.55-100.22-100.22ZM525.72,608.04c-28.24,0-51.4-8.45-69.5-25.35-11.99-11.19-19.98-24.62-24.02-40.27h288.97c-3.07,23.05-9.69,44.92-19.88,65.62h-175.57ZM432.28,482.77c4.07-15.38,12.03-28.71,23.94-39.97,18.09-17.09,41.25-25.65,69.5-25.65h176.16c10.03,20.7,16.52,42.58,19.46,65.62h-289.05ZM328.87,404.33c18.69-32.81,44.24-58.76,76.65-77.85,32.41-19.09,67.9-28.63,106.48-28.63s74.06,9.54,106.48,28.63c15.53,9.15,29.44,19.92,41.82,32.21h-133.98c-31.42,0-59.35,6.56-83.81,19.69-24.46,13.12-43.45,31.12-56.97,53.99-9.2,15.55-15.19,32.38-18.13,50.41h-64.75c3.55-27.86,12.28-54.01,26.2-78.44ZM618.48,697.52c-32.42,19.09-67.91,28.63-106.48,28.63s-74.07-9.54-106.48-28.63c-32.42-19.09-57.97-45.04-76.65-77.85-13.73-24.09-22.39-49.84-26.04-77.25h64.58c2.94,18.04,8.93,34.86,18.13,50.41,13.52,22.87,32.51,40.86,56.97,53.99,24.46,13.12,52.39,19.69,83.81,19.69h132.73c-12.07,11.79-25.55,22.17-40.56,31.02Z';

const ENS_W = 202;
const ENS_H = 231;
const ENS_PATHS = [
  'M98.3592 2.80337L34.8353 107.327C34.3371 108.147 33.1797 108.238 32.5617 107.505C26.9693 100.864 6.13478 72.615 31.9154 46.8673C55.4403 23.3726 85.4045 6.62129 96.5096 0.831705C97.7695 0.174847 99.0966 1.59007 98.3592 2.80337Z',
  'M94.8459 230.385C96.1137 231.273 97.6758 229.759 96.8261 228.467C82.6374 206.886 35.4713 135.081 28.9559 124.302C22.5295 113.67 9.88976 96.001 8.83534 80.8842C8.7301 79.3751 6.64332 79.0687 6.11838 80.4879C5.27178 82.7767 4.37045 85.5085 3.53042 88.6292C-7.07427 128.023 8.32698 169.826 41.7753 193.238L94.8459 230.386V230.385Z',
  'M103.571 228.526L167.095 124.003C167.593 123.183 168.751 123.092 169.369 123.825C174.961 130.465 195.796 158.715 170.015 184.463C146.49 207.957 116.526 224.709 105.421 230.498C104.161 231.155 102.834 229.74 103.571 228.526Z',
  'M107.154 0.930762C105.886 0.0433954 104.324 1.5567 105.174 2.84902C119.363 24.4301 166.529 96.2354 173.044 107.014C179.471 117.646 192.11 135.315 193.165 150.432C193.27 151.941 195.357 152.247 195.882 150.828C196.728 148.539 197.63 145.808 198.47 142.687C209.074 103.293 193.673 61.4905 160.225 38.078L107.154 0.930762Z',
];

/**
 * Official Arc icon (Circle brand kit).
 * @param props.size Height in dp; width follows the icon's 164:171 ratio.
 * @param props.color Fill colour (default Arc navy; the kit also ships black and white).
 * @returns An SVG element, hidden from screen readers.
 */
export function ArcMark({ size, color = colors.brandArc }: { size: number; color?: string }) {
  return (
    <Svg width={(size * ARC_W) / ARC_H} height={size} viewBox={`0 0 ${ARC_W} ${ARC_H}`} {...A11Y_HIDDEN}>
      <Path d={ARC_PATH} fill={color} />
    </Svg>
  );
}

/**
 * Official World logomark.
 * @param props.size Edge length in dp; the mark is round.
 * @param props.color Fill colour (default World off-black; the kit also ships black and white).
 * @returns An SVG element, hidden from screen readers.
 */
export function WorldMark({ size, color = colors.brandWorld }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox={WORLD_BOX} {...A11Y_HIDDEN}>
      <Path d={WORLD_PATH} fill={color} />
    </Svg>
  );
}

/**
 * Official ENS symbol.
 * @param props.size Height in dp; width follows the symbol's 202:231 ratio.
 * @param props.color Fill colour (default ENS Blue; the kit also ships dark blue and white).
 * @returns An SVG element, hidden from screen readers.
 */
export function EnsMark({ size, color = colors.brandEns }: { size: number; color?: string }) {
  return (
    <Svg width={(size * ENS_W) / ENS_H} height={size} viewBox={`0 0 ${ENS_W} ${ENS_H}`} {...A11Y_HIDDEN}>
      {ENS_PATHS.map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}

/** USDC coin blue (from the token's official color icon). */
const USDC_BLUE = '#3E73C4';
const USDC_PATHS = [
  'M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 00.427.303h.975a.416.416 0 00.427-.425v-.06a3.04 3.04 0 00-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 00-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z',
  'M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 00-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546zm6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 007.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z',
];

/**
 * Official USDC token mark (Circle's color icon): white glyph on the coin's blue disc.
 * @param props.size Edge length in dp; the mark is round.
 * @returns An SVG element, hidden from screen readers.
 */
export function UsdcMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" {...A11Y_HIDDEN}>
      <Circle cx={16} cy={16} r={16} fill={USDC_BLUE} />
      {USDC_PATHS.map((d) => (
        <Path key={d} d={d} fill="#FFFFFF" />
      ))}
    </Svg>
  );
}
