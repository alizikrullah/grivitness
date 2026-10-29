import {
  BarbellIcon,
  DropIcon,
  FireIcon,
  FootprintsIcon,
  GaugeIcon,
  MapPinLineIcon,
  MoonStarsIcon,
  PersonSimpleRunIcon,
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
  StatPill,
  Text,
  type BarDatum,
  type LinePoint,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing, typography } from '@/constants/theme';
import { useMonthlySummary, useWeeklySummary } from '@/services/misc.service';
import { useStepsRange } from '@/services/steps.service';
import { useWeightRange } from '@/services/weight.service';
import { useWorkoutsRange } from '@/services/workouts.service';
import type { DistanceKind } from '@/types';
import { dateRange, dayLabel, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { duration, kg, km, pace, signed, thousands, toNum, volume } from '@/utils/format';

/** Sesi yang digambar di grafik lari dan jalan, terbaru di kanan. */
const SESI_DIGAMBAR = 12;
/** Pace terbaik cuma dari sesi minimal sejauh ini: lari 300 m bukan rekor. */
const JARAK_MIN_REKOR_KM = 1;

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

  /**
   * Lari dan jalan: setengah tahun terakhir, supaya grafik perkembangan dan
   * rekornya tidak ikut terpotong pilihan pekan atau bulan. Yang mengikuti
   * periode cuma total jarak dan jumlah sesinya.
   */
  const olahraga = useWorkoutsRange(shiftDays(hariIni, -179), hariIni);
  const [jenisPilihan, setJenisPilihan] = useState<DistanceKind>('RUN');

  const hari = dateRange(from, to);

  // Data dari API tidak punya baris untuk hari yang tidak dicatat. Deretan
  // tanggal dibangun lengkap lebih dulu supaya sumbu chart tidak melompat dan
  // hari kosong terlihat apa adanya sebagai kosong.
  const beratPerHari: LinePoint[] = hari.map((tanggal) => ({
    label: shortDate(tanggal),
    value: toNum(berat.data?.find((l) => l.logged_at === tanggal)?.weight_kg),
  }));

  /**
   * Batang langkah mengikuti periode yang dipilih: tujuh hari, atau setiap
   * hari sejak tanggal 1 untuk bulan ini. Dulu selalu tujuh hari terakhir,
   * jadi memilih "Bulan ini" cuma mengganti angka rata-ratanya dan grafiknya
   * tetap sepekan.
   *
   * Untuk sebulan, label tanggal cuma tiap pekan (1, 8, 15, 22, 29) supaya
   * tidak menumpuk, dan gelembungnya menyebut tanggalnya sendiri.
   */
  const sebulan = periode === 'bulan';
  const langkahPerHari: BarDatum[] = hari.map((tanggal) => {
    const nilai = langkah.data?.find((l) => l.logged_at === tanggal)?.steps ?? null;
    const tgl = Number(tanggal.slice(8));
    return {
      label: sebulan ? ((tgl - 1) % 7 === 0 ? String(tgl) : '') : dayLabel(tanggal),
      value: nilai,
      caption: sebulan ? shortDate(tanggal) + ' · ' + thousands(nilai ?? 0) : thousands(nilai ?? 0),
    };
  });

  const sesiJarak = (olahraga.data ?? [])
    .filter((o) => o.distance_kind !== null && o.distance_km !== null)
    .sort((a, b) =>
      a.logged_at === b.logged_at
        ? (a.started_at ?? a.created_at ?? '').localeCompare(b.started_at ?? b.created_at ?? '')
        : a.logged_at.localeCompare(b.logged_at),
    );
  const adaLari = sesiJarak.some((o) => o.distance_kind === 'RUN');
  const adaJalan = sesiJarak.some((o) => o.distance_kind === 'WALK');
  const jenisTampil: DistanceKind = adaLari && adaJalan ? jenisPilihan : adaLari ? 'RUN' : 'WALK';
  const sesiJenis = sesiJarak.filter((o) => o.distance_kind === jenisTampil);
  const sesiTerakhir = sesiJenis.slice(-SESI_DIGAMBAR);
  const sesiPeriode = sesiJenis.filter((o) => o.logged_at >= from);
  const jarakSesi = (o: (typeof sesiJenis)[number]) => toNum(o.distance_km) ?? 0;

  const totalKm = sesiPeriode.reduce((s, o) => s + jarakSesi(o), 0);
  const paceRekor = sesiJenis
    .filter((o) => o.pace_seconds_per_km !== null && jarakSesi(o) >= JARAK_MIN_REKOR_KM)
    .reduce<number | null>(
      (terbaik, o) =>
        terbaik === null || (o.pace_seconds_per_km ?? Infinity) < terbaik
          ? o.pace_seconds_per_km
          : terbaik,
      null,
    );
  const terjauh = sesiJenis.reduce((m, o) => Math.max(m, jarakSesi(o)), 0);

  const pacePerSesi: LinePoint[] = sesiTerakhir.map((o) => ({
    label: shortDate(o.logged_at),
    value: o.pace_seconds_per_km,
  }));
  const jarakPerSesi: BarDatum[] = sesiTerakhir.map((o) => ({
    label: String(Number(o.logged_at.slice(8))),
    value: jarakSesi(o),
    caption:
      shortDate(o.logged_at) +
      ' · ' +
      km(jarakSesi(o)) +
      ' km' +
      (o.avg_hr !== null ? ' · HR ' + String(o.avg_hr) : ''),
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
                title={sebulan ? 'Langkah bulan ini' : 'Langkah pekan ini'}
                action={
                  <Text variant="caption" tone="tertiary">
                    {/* Dibagi hari yang dicatat, bukan tujuh; jumlahnya disebut supaya jujur. */}
                    {(rekap.data?.step_days ?? 0) > 0
                      ? `rata-rata ${thousands(rekap.data?.avg_steps ?? 0)} dari ${rekap.data?.step_days ?? 0} hari`
                      : 'belum dicatat'}
                  </Text>
                }
              />
              <BarChart data={langkahPerHari} color={metricColors.steps} formatValue={thousands} />
            </View>
          </Card>

          {/* Lari dan jalan dari jam tangan: pace, jarak, dan rekornya. */}
          {sesiJarak.length > 0 ? (
            <Card>
              <View style={styles.weightCard}>
                <SectionHeader
                  title={jenisTampil === 'RUN' ? 'Lari' : 'Jalan'}
                  action={
                    adaLari && adaJalan ? (
                      <View style={styles.chips}>
                        <Chip
                          label="Lari"
                          size="sm"
                          active={jenisTampil === 'RUN'}
                          onPress={() => setJenisPilihan('RUN')}
                        />
                        <Chip
                          label="Jalan"
                          size="sm"
                          active={jenisTampil === 'WALK'}
                          onPress={() => setJenisPilihan('WALK')}
                        />
                      </View>
                    ) : null
                  }
                />

                <View style={styles.pills}>
                  <StatPill
                    icon={<MapPinLineIcon size={16} color={metricColors.workout} weight="fill" />}
                    value={km(totalKm) + ' km'}
                    label={
                      (periode === 'pekan' ? 'Pekan ini, ' : 'Bulan ini, ') +
                      String(sesiPeriode.length) +
                      ' sesi'
                    }
                  />
                  {paceRekor !== null ? (
                    <StatPill
                      icon={<GaugeIcon size={16} color={metricColors.workout} weight="fill" />}
                      value={pace(paceRekor) + '/km'}
                      label="Pace terbaik"
                    />
                  ) : null}
                  <StatPill
                    icon={
                      <PersonSimpleRunIcon size={16} color={metricColors.workout} weight="fill" />
                    }
                    value={km(terjauh) + ' km'}
                    label="Terjauh"
                  />
                </View>

                {pacePerSesi.some((t) => t.value !== null) ? (
                  <>
                    <Text variant="overline" tone="tertiary">
                      Pace per sesi
                    </Text>
                    <LineChart
                      data={pacePerSesi}
                      color={metricColors.workout}
                      invert
                      formatBound={pace}
                    />
                  </>
                ) : null}

                <Text variant="overline" tone="tertiary">
                  Jarak per sesi
                </Text>
                <BarChart
                  data={jarakPerSesi}
                  color={metricColors.workout}
                  formatValue={(n) => km(n) + ' km'}
                />
              </View>
            </Card>
          ) : null}

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
              icon={<ScalesIcon size={16} color={metricColors.weight} weight="fill" />}
              label="Hari ditimbang"
              value={String(rekap.data?.days_logged ?? 0)}
              unit={'dari ' + (rekap.data?.days ?? 0) + ' hari'}
              color={metricColors.weight}
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
