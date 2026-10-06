import { FlameIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar, Text } from '@/components/ui';
import { colors, macroColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { ratio, thousands } from '@/utils/format';

interface MetricTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  /** Kalau diisi, batang progres muncul di bawah nilai. */
  progress?: number;
  color?: string;
  onPress?: () => void;
}

/** Kartu kecil satu metrik. Disusun berdua sebaris di beranda. */
export const MetricTile = ({
  icon,
  label,
  value,
  unit,
  progress,
  color = colors.primary,
  onPress,
}: MetricTileProps) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [styles.tile, pressed && onPress && styles.pressed]}
  >
    <View style={styles.tileHead}>
      <View style={styles.tileIcon}>{icon}</View>
      <Text variant="caption" tone="secondary" numberOfLines={1} style={styles.tileLabel}>
        {label}
      </Text>
    </View>

    <View style={styles.tileValue}>
      <Text variant="h2">{value}</Text>
      {unit ? (
        <Text variant="caption" tone="tertiary">
          {unit}
        </Text>
      ) : null}
    </View>

    {progress !== undefined ? <ProgressBar progress={progress} color={color} height={6} /> : null}
  </Pressable>
);

/**
 * Komposisi lemak, protein, karbohidrat, dan gula dalam satu batang.
 *
 * Urutannya urutan tabel Informasi Nilai Gizi di kemasan: lemak, protein,
 * karbo, gula. Sama dengan isian kemasan di form makanan, dan batang serta
 * keterangannya berurutan sama dari kiri ke kanan.
 *
 * Gula adalah BAGIAN dari karbohidrat, jadi digambar di ujung batang karbo,
 * bukan batang tersendiri yang menghitung gram yang sama dua kali. Karena
 * gula paling akhir di urutan itu, ujung batang karbo memang tempatnya.
 */
export const MacroBar = ({
  protein,
  carbs,
  fat,
  sugar,
}: {
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
}) => {
  const total = protein + carbs + fat;
  // Gula tidak pernah melebihi karbo; ditahan untuk berjaga dari pembulatan.
  const gula = sugar === undefined ? 0 : Math.min(Math.max(sugar, 0), carbs);
  const lebar = (nilai: number) => Math.max(nilai, 0.0001);

  const legenda = [
    { label: 'Lemak', value: fat, color: macroColors.fat },
    { label: 'Protein', value: protein, color: macroColors.protein },
    { label: 'Karbo', value: carbs, color: macroColors.carbs },
    ...(sugar === undefined ? [] : [{ label: 'Gula', value: sugar, color: macroColors.sugar }]),
  ];

  return (
    <View style={styles.macro}>
      <View style={styles.macroBar}>
        {total <= 0 ? (
          <View style={[styles.macroSegment, { flex: 1, backgroundColor: colors.surfaceHigh }]} />
        ) : (
          <>
            <View
              style={[styles.macroSegment, { flex: lebar(fat), backgroundColor: macroColors.fat }]}
            />
            <View
              style={[
                styles.macroSegment,
                { flex: lebar(protein), backgroundColor: macroColors.protein },
              ]}
            />
            <View style={[styles.macroSegment, styles.macroCarbs, { flex: lebar(carbs) }]}>
              <View style={{ flex: lebar(carbs - gula), backgroundColor: macroColors.carbs }} />
              {gula > 0 ? (
                <View style={{ flex: lebar(gula), backgroundColor: macroColors.sugar }} />
              ) : null}
            </View>
          </>
        )}
      </View>

      {/* Kolom sama lebar, supaya keterangannya rata seperti tabel. */}
      <View style={styles.macroLegend}>
        {legenda.map((b) => (
          <View key={b.label} style={styles.macroItem}>
            <View style={styles.macroItemHead}>
              <View style={[styles.dot, { backgroundColor: b.color }]} />
              <Text variant="caption" tone="secondary">
                {b.label}
              </Text>
            </View>
            <Text variant="label">{Math.round(b.value)}g</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/**
 * Lencana rentetan hari.
 *
 * Angka nol tetap ditampilkan, tidak disembunyikan. Rentetan yang putus adalah
 * informasi yang berguna, menyembunyikannya membuat user mengira fiturnya rusak.
 */
export const StreakBadge = ({ current, longest }: { current: number; longest: number }) => {
  const menyala = current > 0;

  return (
    <View style={[styles.streak, menyala && styles.streakOn]}>
      <FlameIcon
        size={18}
        color={menyala ? colors.primary : colors.textTertiary}
        weight={menyala ? 'fill' : 'regular'}
      />
      <Text variant="label" tone={menyala ? 'accent' : 'tertiary'}>
        {current}
      </Text>
      <Text variant="caption" tone="tertiary">
        hari{longest > current ? ' · rekor ' + longest : ''}
      </Text>
    </View>
  );
};

/** Ringkasan satu baris: nilai besar, target kecil, batang progres. */
export const GoalProgress = ({
  label,
  value,
  target,
  unit,
  color = colors.primary,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  color?: string;
}) => (
  <View style={styles.goal}>
    <View style={styles.goalHead}>
      <Text variant="bodyMedium" tone="secondary">
        {label}
      </Text>
      <Text variant="label">
        {thousands(value)}
        <Text variant="caption" tone="tertiary">
          {' / ' + thousands(target) + ' ' + unit}
        </Text>
      </Text>
    </View>
    <ProgressBar progress={ratio(value, target)} color={color} height={6} />
  </View>
);

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pressed: { opacity: 0.75 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tileIcon: {
    backgroundColor: colors.surfaceHigh,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flex: 1 },
  tileValue: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  macro: { gap: spacing.md },
  macroBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: colors.surfaceHigh,
  },
  macroSegment: { height: '100%' },
  macroCarbs: { flexDirection: 'row' },
  macroLegend: { flexDirection: 'row' },
  macroItem: { flex: 1, gap: 2 },
  macroItemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  streakOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  goal: { gap: spacing.sm },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
