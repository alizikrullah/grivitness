import { FireIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Ring, Text } from '@/components/ui';
import { colors, flame } from '@/constants/colors';
import { spacing, typography } from '@/constants/theme';
import { ratio, thousands } from '@/utils/format';

interface CalorieRingChartProps {
  caloriesIn: number;
  budget: number | null;
  size?: number;
}

/**
 * Cincin jatah kalori harian.
 *
 * Warnanya berubah begitu jatah terlampaui. Ini satu-satunya tempat di beranda
 * yang boleh berubah jadi merah dengan sendirinya — justru itu gunanya, supaya
 * lewat budget terbaca sekilas tanpa perlu membaca angkanya.
 */
export const CalorieRingChart = ({ caloriesIn, budget, size = 190 }: CalorieRingChartProps) => {
  const adaBudget = budget !== null && budget > 0;
  const sisa = adaBudget ? budget - caloriesIn : null;
  const lewat = sisa !== null && sisa < 0;

  const warna = !adaBudget
    ? colors.textSecondary
    : lewat
      ? colors.primary
      : ratio(caloriesIn, budget) > 0.85
        ? colors.warning
        : colors.success;

  return (
    <View style={styles.wrapper}>
      <Ring
        progress={adaBudget ? ratio(caloriesIn, budget) : 0}
        size={size}
        thickness={14}
        color={warna}
        sweep={0.78}
      >
        <View style={styles.center}>
          <FireIcon
            size={22}
            weight="duotone"
            color={flame.outline}
            duotoneColor={flame.body}
            duotoneOpacity={1}
          />

          <Text style={typography.metric}>{thousands(caloriesIn)}</Text>

          <Text variant="caption" tone="secondary">
            {adaBudget ? 'dari ' + thousands(budget) + ' kkal' : 'kkal masuk'}
          </Text>
        </View>
      </Ring>

      {sisa !== null ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: lewat ? colors.primarySoft : colors.successSoft },
          ]}
        >
          <Text variant="label" color={lewat ? colors.primary : colors.success}>
            {lewat
              ? 'Lewat ' + thousands(Math.abs(sisa)) + ' kkal'
              : 'Sisa ' + thousands(sisa) + ' kkal'}
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="tertiary" align="center">
          Tetapkan target berat untuk melihat jatah kalori harian
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: spacing.md },
  center: { alignItems: 'center', gap: 2 },
  badge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
});
