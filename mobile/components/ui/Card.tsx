import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';

interface CardProps {
  children: ReactNode;
  /**
   * `raised` menambahkan gradien halus dari sudut kiri atas. Di tema segelap
   * ini, kartu polos menyatu dengan latar; gradien tipis itu yang memberi
   * kesan permukaan terangkat tanpa perlu bayangan.
   */
  variant?: 'flat' | 'raised' | 'outline';
  padding?: keyof typeof spacing | 'none';
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
}

export const Card = ({
  children,
  variant = 'raised',
  padding = 'lg',
  style,
  onPress,
}: CardProps) => {
  const isi = (
    <View style={[styles.inner, padding !== 'none' && { padding: spacing[padding] }]}>
      {children}
    </View>
  );

  const badan =
    variant === 'raised' ? (
      <LinearGradient
        colors={['#17171A', '#101012']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.base, styles.raised, style]}
      >
        {isi}
      </LinearGradient>
    ) : (
      <View style={[styles.base, variant === 'outline' ? styles.outline : styles.flat, style]}>
        {isi}
      </View>
    );

  if (!onPress) return badan;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {badan}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  raised: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  flat: {
    backgroundColor: colors.surface,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  inner: {
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.99 }],
  },
});
