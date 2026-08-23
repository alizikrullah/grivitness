import { CaretRightIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';

interface ReminderRowProps {
  icon: ReactNode;
  label: string;
  /** Jam atau interval yang sedang berlaku, ditampilkan sebagai pil yang bisa disentuh. */
  value: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  onPressValue: () => void;
  last?: boolean;
}

/**
 * Satu baris pengaturan pengingat.
 *
 * Sakelar dan nilainya sengaja dipisah jadi dua sasaran sentuh. Menyalakan
 * pengingat dan mengubah jamnya adalah dua niat yang berbeda, dan menggabungkan
 * keduanya ke satu baris yang membuka sheet berarti menyalakan pengingat butuh
 * dua ketukan untuk hal yang seharusnya satu.
 *
 * Pil nilainya diredupkan saat pengingat mati — masih bisa disentuh untuk
 * mengatur jam terlebih dulu, tapi terlihat jelas bahwa belum ada yang berbunyi.
 */
export const ReminderRow = ({
  icon,
  label,
  value,
  enabled,
  onToggle,
  onPressValue,
  last = false,
}: ReminderRowProps) => (
  <View style={[styles.row, !last && styles.border]}>
    {icon}

    <Text variant="bodyMedium" style={styles.label} numberOfLines={1}>
      {label}
    </Text>

    <Pressable
      onPress={onPressValue}
      accessibilityRole="button"
      accessibilityLabel={label + ', atur ' + value}
      style={({ pressed }) => [styles.pill, !enabled && styles.pillOff, pressed && styles.pressed]}
    >
      <Text variant="caption" tone={enabled ? 'primary' : 'tertiary'} numberOfLines={1}>
        {value}
      </Text>
      <CaretRightIcon
        size={12}
        color={enabled ? colors.textSecondary : colors.textTertiary}
        weight="bold"
      />
    </Pressable>

    <Switch
      value={enabled}
      onValueChange={onToggle}
      trackColor={{ false: colors.surfaceHigh, true: colors.primary }}
      thumbColor={colors.white}
      ios_backgroundColor={colors.surfaceHigh}
    />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  border: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pillOff: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  pressed: { opacity: 0.6 },
});
