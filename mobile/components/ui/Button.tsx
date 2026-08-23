import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/constants/colors';
import { elevation, radius, spacing, typography } from '@/constants/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const HEIGHT: Record<Size, number> = { sm: 40, md: 48, lg: 56 };

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
}: ButtonProps) => {
  const mati = disabled || loading;

  const tekan = () => {
    if (mati) return;
    // Getaran halus saat tombol utama ditekan. Ini yang membedakan rasa aplikasi
    // asli dari halaman web yang dibungkus.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const warnaTeks =
    variant === 'primary' || variant === 'danger' ? colors.white : colors.textPrimary;

  return (
    <Pressable
      onPress={tekan}
      disabled={mati}
      accessibilityRole="button"
      accessibilityState={{ disabled: mati, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { height: HEIGHT[size] },
        VARIANT[variant],
        variant === 'primary' && !mati && elevation.glow,
        fullWidth && styles.fullWidth,
        pressed && !mati && styles.pressed,
        mati && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={warnaTeks} size="small" />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[typography.label, { color: warnaTeks, fontSize: size === 'lg' ? 16 : 15 }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const VARIANT: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  danger: { backgroundColor: colors.primaryDim },
  secondary: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  ghost: { backgroundColor: 'transparent' },
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.4 },
});
