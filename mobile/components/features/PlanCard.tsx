import { FireIcon, FootprintsIcon, TrendDownIcon, WarningCircleIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { ObservedTdeeNote } from '@/components/features/ObservedTdeeNote';
import { Card, Divider, Row, Text } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import type { DailyTargets, GoalWithProgress } from '@/types';
import { longDate, shiftDays, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';

interface PlanCardProps {
  goal: GoalWithProgress;
  /** Target makro dari rekap harian. Null kalau belum tersedia. */
  targets?: DailyTargets | null;
}

const kgPerMinggu = (n: number): string => Math.abs(n).toFixed(2).replace('.', ',') + ' kg';

/**
 * Menjelaskan rencana penurunan berat badan dengan angka yang bisa dijalankan.
 *
 * Yang paling penting di kartu ini adalah bagian peringatannya. Target yang
 * terlalu agresif TIDAK dipaksakan jadi anjuran, backend menahan budget di
 * batas aman, lalu kartu ini menyampaikan dua hal yang selama ini disembunyikan
 * aplikasi sejenis: kapan targetmu benar-benar tercapai pada jatah yang aman,
 * dan berapa langkah tambahan yang bisa menutup selisihnya.
 *
 * Menyembunyikan itu berarti user menjalankan program yang diam-diam tidak
 * mungkin berhasil, lalu menyalahkan dirinya sendiri saat tidak berhasil.
 */
export const PlanCard = ({ goal, targets }: PlanCardProps) => {
  const plan = goal.plan;

  if (!plan) {
    return (
      <Card variant="outline" padding="md">
        <Text variant="caption" tone="tertiary">
          Isi profil dan catat berat badan dulu supaya rencananya bisa dihitung.
        </Text>
      </Card>
    );
  }

  const turun = plan.daily_deficit > 0;
  const tanggalNyata =
    plan.projected_days === null ? null : shiftDays(todayWIB(), plan.projected_days);

  return (
    <Card>
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={styles.headIcon}>
            <TrendDownIcon size={20} color={colors.primary} weight="duotone" />
          </View>

          <View style={styles.headText}>
            <Text variant="label">
              {turun ? 'Turun ' : 'Naik '}
              {kgPerMinggu(plan.weekly_rate_kg)} per minggu
            </Text>
            <Text variant="caption" tone="tertiary">
              Batas aman {kgPerMinggu(plan.safe_weekly_rate_kg)} per minggu
            </Text>
          </View>
        </View>

        <Divider />

        <Row
          label="Jatah harian"
          value={thousands(plan.daily_calorie_budget) + ' kkal'}
          icon={<FireIcon size={16} color={metricColors.calories} weight="duotone" />}
          tone="accent"
        />
        <Row
          label={turun ? 'Defisit harian' : 'Surplus harian'}
          value={thousands(Math.abs(plan.daily_deficit)) + ' kkal'}
        />
        <Row
          label={goal.observed_tdee?.measured === null ? 'Perkiraan pengeluaran' : 'Pengeluaran'}
          value={thousands(plan.tdee) + ' kkal'}
        />

        {goal.observed_tdee ? <ObservedTdeeNote observed={goal.observed_tdee} /> : null}

        {targets?.macros ? (
          <>
            <Divider />
            {/*
              Protein didahulukan karena dialah yang menentukan apakah berat yang
              hilang itu lemak atau otot, dan otot itu yang menjaga metabolisme
              tetap tinggi setelah programnya selesai.
            */}
            <Row label="Protein" value={targets.macros.protein_g + ' g'} tone="success" />
            <Row label="Karbohidrat" value={targets.macros.carbs_g + ' g'} />
            <Row label="Lemak" value={targets.macros.fat_g + ' g'} />
          </>
        ) : null}

        {!plan.achievable ? (
          <View style={styles.warn}>
            <WarningCircleIcon size={18} color={colors.warning} weight="duotone" />

            <View style={styles.warnText}>
              <Text variant="label" tone="primary">
                Targetmu lebih cepat dari yang aman
              </Text>

              <Text variant="caption" tone="secondary">
                Mengejar tanggal itu butuh defisit {thousands(plan.required_deficit)} kkal per hari.
                Jatah di atas ditahan di batas aman supaya kamu tidak kehilangan otot.
                {tanggalNyata
                  ? ' Dengan jatah itu, targetmu tercapai sekitar ' + longDate(tanggalNyata) + '.'
                  : ''}
              </Text>

              {plan.extra_steps_needed > 0 ? (
                <View style={styles.steps}>
                  <FootprintsIcon
                    size={14}
                    color={metricColors.steps}
                    weight="fill"
                    style={styles.stepsIcon}
                  />
                  <Text variant="caption" tone="secondary" style={styles.stepsText}>
                    Tambah {thousands(plan.extra_steps_needed)} langkah per hari untuk mengejar
                    tanggal aslinya.
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headText: { flex: 1, gap: 2 },
  warn: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  warnText: { flex: 1, gap: spacing.xs },
  // Teks di dalam baris WAJIB diberi flex. Tanpa itu React Native membiarkannya
  // memanjang melewati tepi kartu alih-alih membungkus ke baris berikutnya.
  steps: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  stepsIcon: { marginTop: 1 },
  stepsText: { flex: 1 },
});
