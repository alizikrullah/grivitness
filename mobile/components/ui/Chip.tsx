import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { Text } from './Text';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md';
}

export const Chip = ({ label, active = false, onPress, size = 'md' }: ChipProps) => (
  <Pressable
    onPress={() => {
      if (!onPress) return;
      void Haptics.selectionAsync();
      onPress();
    }}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    style={({ pressed }) => [
      styles.chip,
      size === 'sm' ? styles.sm : styles.md,
      active ? styles.active : styles.inactive,
      pressed && styles.pressed,
    ]}
  >
    <Text
      variant={size === 'sm' ? 'caption' : 'label'}
      tone={active ? 'inverse' : 'secondary'}
      numberOfLines={1}
    >
      {label}
    </Text>
  </Pressable>
);

interface ChipGroupProps<T extends string> {
  options: readonly T[];
  value: T | null;
  onChange: (value: T) => void;
  labels?: Record<string, string>;
  /** Menyusun chip mengalir ke bawah, bukan menggulir menyamping. */
  wrap?: boolean;
}

/**
 * Deretan chip pilihan.
 *
 * Bergulir menyamping secara bawaan, mengikuti pola filter di referensi.
 * Dipakai `wrap` kalau semua pilihan perlu terlihat sekaligus tanpa digulir,
 * misalnya saat memilih jenis makan.
 */
export const ChipGroup = <T extends string>({
  options,
  value,
  onChange,
  labels,
  wrap = false,
}: ChipGroupProps<T>) => {
  const isi = options.map((option) => (
    <Chip
      key={option}
      label={labels?.[option] ?? option}
      active={value === option}
      onPress={() => onChange(option)}
    />
  ));

  if (wrap) return <View style={styles.wrap}>{isi}</View>;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {isi}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: { paddingHorizontal: spacing.xl, height: 44 },
  sm: { paddingHorizontal: spacing.lg, height: 34 },
  active: { backgroundColor: colors.primary },
  inactive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pressed: { opacity: 0.8 },
  row: { gap: spacing.sm, paddingRight: spacing.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
