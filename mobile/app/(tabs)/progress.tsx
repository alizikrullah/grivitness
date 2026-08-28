import {
  BarbellIcon,
  DropIcon,
  FireIcon,
  FootprintsIcon,
  MoonStarsIcon,
  ScalesIcon,
  TrendDownIcon,
  TrendUpIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MetricTile } from '@/components/features/Metrics';
import {
  BarChart,
  Card,
  Chip,
  LineChart,
  Loading,
  Screen,
  SectionHeader,
  Text,
  type BarDatum,
  type LinePoint,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing, typography } from '@/constants/theme';
import { useMonthlySummary, useWeeklySummary } from '@/services/misc.service';
import { useStepsRange } from '@/services/steps.service';
import { useWeightRange } from '@/services/weight.service';
import { dateRange, dayLabel, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { duration, kg, signed, thousands, toNum, volume } from '@/utils/format';

type Periode = 'pekan' | 'bulan';

export default function ProgressScreen() {
  const [periode, setPeriode] = useState<Periode>('pekan');

  const hariIni = todayWIB();
  const tahun = Number(hariIni.slice(0, 4));
  const bulan = Number(hariIni.slice(5, 7));

  const awalPekan = shiftDays(hariIni, -6);
  const awalBulan = hariIni.slice(0, 8) + '01';

  const from = periode === 'pekan' ? awalPekan : awalBulan;
  const to = hariIni;

  const mingguan = useWeeklySummary(awalPekan);
  const bulanan = useMonthlySummary(tahun, bulan);
  const rekap = periode === 'pekan' ? mingguan : bulanan;

  const berat = useWeightRange(from, to);
  const langkah = useStepsRange(from, to);

  const hari = dateRange(from, to);

  // Data dari API tidak punya baris untuk hari yang tidak dicatat. Deretan
  // tanggal dibangun lengkap lebih dulu supaya sumbu chart tidak melompat dan
  // hari kosong terlihat apa adanya sebagai kosong.
  const beratPerHari: LinePoint[] = hari.map((tanggal) => ({
    label: shortDate(tanggal),
    value: toNum(berat.data?.find((l) => l.logged_at === tanggal)?.weight_kg),
  }));

  const langkahPerHari: BarDatum[] = hari.slice(-7).map((tanggal) => ({
    label: dayLabel(tanggal),
    value: langkah.data?.find((l) => l.logged_at === tanggal)?.steps ?? null,
    caption: thousands(langkah.data?.find((l) => l.logged_at === tanggal)?.steps ?? 0),
  }));

  const perubahan = rekap.data?.weight_change_kg ?? null;
  const turun = perubahan !== null && perubahan < 0;

  const memuat = rekap.isPending || berat.isPending || langkah.isPending;

  const segarkan = () => {
    void rekap.refetch();
    void berat.refetch();
    void langkah.refetch();
  };

  return (
    <Screen bottomInset refreshing={rekap.isRefetching} onRefresh={segarkan}>
      <View style={styles.hero}>
        <Text variant="overline" tone="accent">
          Analitik kamu
        </Text>
        <Text variant="h1">Progres</Text>
      </View>

      <View style={styles.chips}>
        <Chip label="Pekan ini" active={periode === 'pekan'} onPress={() => setPeriode('pekan')} />
        <Chip label="Bulan ini" active={periode === 'bulan'} onPress={() => setPeriode('bulan')} />
      </View>

      {memuat ? (
        <Loading />
      ) : (
        <>
          <Card>
            <View style={styles.weightCard}>
              <SectionHeader
                title="Berat badan"
                action={
                  perubahan !== null ? (
                    <View
                      style={[
                        styles.delta,
                        { backgroundColor: turun ? colors.successSoft : colors.primarySoft },
                      ]}
                    >
                      {turun ? (
                        <TrendDownIcon size={14} color={colors.success} weight="bold" />
                      ) : (
                        <TrendUpIcon size={14} color={colors.primary} weight="bold" />
                      )}
                      <Text variant="caption" color={turun ? colors.success : colors.primary}>
                        {signed(perubahan)} kg
                      </Text>
                    </View>
                  ) : null
                }
              />

              <View style={styles.bigNumber}>
                <Text style={typography.display}>
                  {rekap.data?.weight_end != null ? kg(rekap.data.weight_end, 1) : '-'}
                </Text>
                <Text variant="label" tone="secondary">
                  kg
                </Text>
              </View>

              <LineChart data={beratPerHari} color={metricColors.weight} />
            </View>
          </Card>

          <Card>
            <View style={styles.weightCard}>
              <SectionHeader
                title="Langkah 7 hari"
                action={
                  <Text variant="caption" tone="tertiary">
                    rata-rata {thousands(rekap.data?.avg_steps ?? 0)}
                  </Text>
                }
              />
              <BarChart data={langkahPerHari} color={metricColors.steps} formatValue={thousands} />
            </View>
          </Card>

          <SectionHeader title={periode === 'pekan' ? 'Rekap pekan ini' : 'Rekap bulan ini'} />

          <View style={styles.grid}>
            {/* Ditampilkan sebagai TOTAL, bukan rata-rata. Rata-rata dihitung
                backend dengan membagi jumlah hari kalender, jadi 600 kkal yang
                dicatat sehari terbaca 86 kkal di pekan yang baru berjalan satu
                hari, angka yang benar secara aritmetika tapi menyesatkan. */}
            <MetricTile
              icon={<FireIcon size={16} color={metricColors.calories} weight="fill" />}
              label="Kalori masuk"
              value={thousands(rekap.data?.total_calories_in ?? 0)}
              unit="kkal total"
              color={metricColors.calories}
            />
            <MetricTile
              icon={<FootprintsIcon size={16} color={metricColors.steps} weight="fill" />}
              label="Total langkah"
              value={thousands(rekap.data?.total_steps ?? 0)}
              color={metricColors.steps}
            />
          </View>

          <View style={styles.grid}>
            <MetricTile
              icon={<BarbellIcon size={16} color={metricColors.workout} weight="fill" />}
              label="Olahraga"
              value={duration(rekap.data?.total_workout_minutes ?? 0)}
              unit={thousands(rekap.data?.total_workout_calories ?? 0) + ' kkal'}
              color={metricColors.workout}
            />
            <MetricTile
              icon={<MoonStarsIcon size={16} color={metricColors.sleep} weight="fill" />}
              label="Tidur"
              value={duration(rekap.data?.total_sleep_minutes ?? 0)}
              unit="total"
              color={metricColors.sleep}
            />
          </View>

          <View style={styles.grid}>
            <MetricTile
              icon={<DropIcon size={16} color={metricColors.water} weight="fill" />}
              label="Total air"
              value={volume(rekap.data?.total_water_ml ?? 0)}
              color={metricColors.water}
            />
            {/* Backend menghitungnya dari jumlah baris weight_logs, jadi yang
                terhitung khusus hari saat berat badan ditimbang, bukan hari
                dengan pencatatan apa pun. Labelnya menyebutkan itu apa adanya. */}
            <MetricTile
              icon={<ScalesIcon size={16} color={colors.textSecondary} weight="fill" />}
              label="Hari ditimbang"
              value={String(rekap.data?.days_logged ?? 0)}
              unit={'dari ' + (rekap.data?.days ?? 0) + ' hari'}
              color={colors.textSecondary}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm },
  weightCard: { gap: spacing.lg },
  bigNumber: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
  },
  grid: { flexDirection: 'row', gap: spacing.md },
});
