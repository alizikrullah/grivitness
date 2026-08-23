import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/constants/colors';
import { radius } from '@/constants/theme';

interface IconCircleProps {
  children: ReactNode;
  size?: number;
  /** Warna latar. Kalau kosong, dipakai permukaan gelap netral. */
  background?: string;
  /** Membuat sudutnya membulat penuh, bukan kotak-bulat. */
  round?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Ikon di dalam wadah gelap.
 *
 * Elemen berulang di seluruh referensi visual: hampir setiap ikon duduk di
 * lingkaran atau kotak-bulat yang sedikit lebih terang dari latarnya. Pola itu
 * yang membuat ikon terbaca sebagai objek, bukan sebagai hiasan yang menempel.
 */
export const IconCircle = ({
  children,
  size = 40,
  background,
  round = true,
  onPress,
  style,
}: IconCircleProps) => {
  const badan = (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: round ? size / 2 : radius.md,
          backgroundColor: background ?? colors.surfaceHigh,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return badan;

  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
      {badan}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pressed: { opacity: 0.6 },
});
