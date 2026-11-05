/**
 * @file Design tokens: colors, type scale, spacing, radii and elevation.
 *
 * The Beam palette: purple #6E54FF, lavender #DDD7FE and ink #0E091C on an
 * off-white canvas. Inter for all UI text; Roboto Mono only for addresses and hashes.
 *
 * Light mode only, by product decision. Every screen and component
 * takes values from here; no hex codes or font names elsewhere.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const colors = {
  /** App canvas behind cards (off-white). */
  canvas: '#FBFAF9',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F4F8',
  border: '#ECEAF1',
  borderStrong: '#DCD8E6',

  /** Ink: primary text. */
  text: '#0E091C',
  textSecondary: '#5B5770',
  textTertiary: '#8F8BA3',
  textInverse: '#FFFFFF',

  /** Ink, for the dark QR modules. */
  ink: '#0E091C',

  /** Beam purple. */
  primary: '#6E54FF',
  primaryPressed: '#5A40F0',
  primarySoft: '#F1EFFF',
  /** Beam lavender. */
  primarySoftBorder: '#DDD7FE',

  success: '#0B9F6B',
  successSoft: '#E6F7F0',
  warning: '#B4650A',
  warningSoft: '#FFF5E6',
  warningBorder: '#FFDCA8',
  danger: '#D6364A',
  dangerSoft: '#FDECEE',

  // Partner brand colours, used only for their official marks (see `components/logos.tsx`).
  /** Arc navy, from the Circle brand kit's flat Arc icon. */
  brandArc: '#1B3158',
  /** World off-black, from the World logomark kit. */
  brandWorld: '#2D2C2C',
  /** ENS Blue, from ens.domains/brand. */
  brandEns: '#0080BC',

  /** Dimmed backdrop behind the ask sheet. */
  scrim: 'rgba(14, 9, 28, 0.42)',
} as const;

export type ColorToken = keyof typeof colors;

/** Font family names registered in `app/_layout.tsx`. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  mono: 'RobotoMono_400Regular',
  monoMedium: 'RobotoMono_500Medium',
  monoBold: 'RobotoMono_600SemiBold',
} as const;

/** Type scale. Line heights are explicit so Android and iOS render alike. */
export const type = {
  /** Wallet balance. */
  display: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 46, letterSpacing: -1.6, fontVariant: ['tabular-nums'] },
  title: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.7 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 21, letterSpacing: -0.1 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 17 },
  captionStrong: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17 },
  /** Quiet label: section titles, pills, field labels. Sentence case. */
  overline: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, letterSpacing: -0.1 },
  /** Button text. Sentence case. */
  button: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 20, letterSpacing: -0.2 },
  /** Amounts in rows and cards. */
  amount: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  /** Addresses and hashes. */
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 19 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** 4-pt spacing scale. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, xxl: 28, pill: 999 } as const;

/** Soft, low-contrast elevation. Cards rely on hairline borders; only floating layers get shadows. */
export const shadow = {
  card: Platform.select<ViewStyle>({
    android: { elevation: 0 },
    default: { shadowColor: '#0E091C', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },
  }),
  sheet: Platform.select<ViewStyle>({
    android: { elevation: 16 },
    default: { shadowColor: '#0E091C', shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: -4 } },
  }),
} as const;

/** Minimum touch target (Material guidance). */
export const HIT = 48;
