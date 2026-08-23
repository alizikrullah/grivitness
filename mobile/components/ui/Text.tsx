import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors } from '@/constants/colors';
import { typography } from '@/constants/theme';

type Variant = keyof typeof typography;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'warning' | 'inverse';

const TONE: Record<Tone, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.primary,
  success: colors.success,
  warning: colors.warning,
  inverse: colors.white,
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  align?: TextStyle['textAlign'];
  /** Warna bebas di luar palet tone, dipakai chart dan ikon per metrik. */
  color?: string;
}

/**
 * Satu-satunya cara menampilkan teks di aplikasi ini.
 *
 * Memakai <Text> bawaan React Native berarti font sistem yang terpakai, dan
 * hasilnya langsung terlihat berbeda dari sekitarnya. Membungkusnya di sini
 * memastikan tidak ada teks yang lolos tanpa font dan warna yang benar.
 */
export const Text = ({
  variant = 'body',
  tone = 'primary',
  align,
  color,
  style,
  ...rest
}: TextProps) => (
  <RNText
    style={[typography[variant], { color: color ?? TONE[tone], textAlign: align }, style]}
    {...rest}
  />
);
