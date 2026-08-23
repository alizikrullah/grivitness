import { Platform } from 'react-native';

import { colors } from './colors';

/** Kelipatan 4, sesuai CLAUDE.md section 11. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Radius mengikuti referensi visual: jauh lebih bulat dari nilai awal di
 * CLAUDE.md. Kartu besar 24, kontrol 14, pill sepenuhnya bulat.
 */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

/**
 * Skala tipografi. Angka besar sengaja pakai letterSpacing negatif — pada
 * ukuran display, jarak huruf bawaan terlihat renggang dan kurang tegas.
 */
export const typography = {
  display: { fontFamily: fonts.extrabold, fontSize: 40, lineHeight: 44, letterSpacing: -1.2 },
  h1: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  h2: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
  /** Label kecil huruf besar untuk judul bagian dan satuan. */
  overline: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  /** Angka besar di kartu metrik. */
  metric: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
} as const;

/**
 * Bayangan di tema gelap nyaris tidak terlihat, jadi kedalaman dibentuk dari
 * garis tepi tipis. Bayangan hanya dipakai untuk elemen melayang seperti
 * tombol utama dan tab bar.
 */
export const elevation = {
  card: Platform.select({
    ios: {
      shadowColor: colors.black,
      shadowOpacity: 0.4,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 4 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: colors.primary,
      shadowOpacity: 0.45,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 8 },
    default: {},
  }),
} as const;
