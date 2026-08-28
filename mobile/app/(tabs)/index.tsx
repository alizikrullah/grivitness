import { useRouter } from 'expo-router';
import {
  ArrowRightIcon,
  BarbellIcon,
  BellIcon,
  DropIcon,
  FootprintsIcon,
  MoonStarsIcon,
  ScalesIcon,
  WarningCircleIcon,
} from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { CalorieRingChart } from '@/components/features/CalorieRingChart';
import { MacroBar, MetricTile, StreakBadge } from '@/components/features/Metrics';
import { Card, IconCircle, Loading, Screen, SectionHeader, Text } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { useDailySummary, useStreak } from '@/services/misc.service';
import { useProfile } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { greeting, longDate, todayWIB } from '@/utils/date';
import { duration, initials, kg, thousands, volume } from '@/utils/format';

/**
 * Pembagian yang aman terhadap target yang belum ada.
 *
 * Target sekarang datang dari backend, diturunkan dari berat, tinggi, usia, dan
 * target berat badan user. Sebelumnya ditulis di sini sebagai angka tetap, * 10.000 langkah, 2500ml, 8 jam, yang sama untuk semua orang dan tidak satu pun
 * punya sumber. Yang 10.000 langkah bahkan asalnya nama produk pedometer Jepang
 * tahun 1965, bukan penelitian.
 */
const rasio = (nilai: number, target: number | undefined): number =>
  target && target > 0 ? nilai / target : 0;

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const hariIni = todayWIB();
  const summary = useDailySummary(hariIni);
  const streak = useStreak();
  const profile = useProfile();

  const memuat = summary.isPending;
  const data = summary.data;

  const segarkan = () => {
    void summary.refetch();
    void streak.refetch();
    void profile.refetch();
  };

  return (
    <Screen bottomInset refreshing={summary.isRefetching} onRefresh={segarkan}>
      <View style={styles.topBar}>
        <View style={styles.avatar}>
          <Text variant="label" tone="inverse">
            {initials(user?.name ?? 'G')}
          </Text>
        </View>

        <View style={styles.greeting}>
          <Text variant="caption" tone="secondary">
            {greeting()}
          </Text>
          <Text variant="h3" numberOfLines={1}>
            {user?.name ?? 'GriviTness'}
          </Text>
        </View>

        <IconCircle size={44} onPress={() => router.push('/(tabs)/profile')}>
          <BellIcon size={20} color={colors.textPrimary} weight="regular" />
        </IconCircle>
      </View>

      <View style={styles.dateRow}>
        <Text variant="caption" tone="tertiary">
          {longDate(hariIni)}
        </Text>
        <StreakBadge
          current={streak.data?.current_streak ?? 0}
          longest={streak.data?.longest_streak ?? 0}
        />
      </View>

      {/* Profil kosong berarti TDEE tidak bisa dihitung, dan hampir semua angka
          di layar ini jadi setengah benar. Diberitahukan di atas, bukan dibiarkan
          user menebak kenapa kalori keluarnya terlihat kecil. */}
      {!profile.isPending && !profile.data ? (
        <Card variant="outline" onPress={() => router.push('/onboarding')}>
          <View style={styles.notice}>
            <WarningCircleIcon size={22} color={colors.warning} weight="duotone" />
            <View style={styles.noticeText}>
              <Text variant="label">Lengkapi profil kamu</Text>
              <Text variant="caption" tone="secondary">
                Tinggi, usia, dan jenis pekerjaan dipakai menghitung kebutuhan kalori.
              </Text>
            </View>
            <ArrowRightIcon size={18} color={colors.textSecondary} weight="bold" />
          </View>
        </Card>
      ) : null}

      {memuat ? (
        <Loading />
      ) : (
        <>
          <Card>
            <View style={styles.ringCard}>
              <CalorieRingChart
                caloriesIn={data?.calories_in ?? 0}
                budget={data?.calorie_budget ?? null}
              />

              <View style={styles.burnRow}>
                <View style={styles.burnItem}>
                  {/*
                    Labelnya menyebut sumbernya kalau angkanya datang dari
                    smartwatch. Dua angka yang dihasilkan cara berbeda tidak
                    boleh tampil dengan nama yang sama persis, karena user jadi
                    tidak punya cara tahu yang mana yang sedang dia baca.
                  */}
                  <Text variant="overline" tone="tertiary">
                    {data?.calories_out_source === 'device' ? 'Keluar (jam)' : 'Keluar'}
                  </Text>
                  <Text variant="h3">{thousands(data?.calories_out ?? 0)}</Text>
                </View>

                <View style={styles.burnDivider} />

                <View style={styles.burnItem}>
                  <Text variant="overline" tone="tertiary">
                    Berat
                  </Text>
                  <Text variant="h3">
                    {data?.weight_kg === null || data?.weight_kg === undefined
                      ? '-'
                      : kg(data.weight_kg) + ' kg'}
                  </Text>
                </View>
              </View>

              {/*
                Susunan "keluar" dibuka, bukan cuma satu angka besar yang harus
                dipercaya. Ketiganya TIDAK saling tumpang tindih: 24 jam dibagi
                habis, jadi jam olahraga dan jam berjalan diambil dari jatah
                metabolisme, bukan ditambahkan di atasnya.
              */}
              {data?.energy ? (
                <Text variant="caption" tone="tertiary" style={styles.burnNote}>
                  {thousands(data.energy.baseline)} metabolisme + {data.energy.step_calories}{' '}
                  langkah + {data.energy.workout_calories} olahraga
                </Text>
              ) : null}
            </View>
          </Card>

          <SectionHeader title="Hari ini" />

          <View style={styles.grid}>
            <MetricTile
              icon={<FootprintsIcon size={16} color={metricColors.steps} weight="fill" />}
              label="Langkah"
              value={thousands(data?.steps ?? 0)}
              unit={'dari ' + thousands(data?.targets.steps.steps ?? 0)}
              progress={rasio(data?.steps ?? 0, data?.targets.steps.steps)}
              color={metricColors.steps}
              onPress={() => router.push('/log/steps')}
            />
            <MetricTile
              icon={<DropIcon size={16} color={metricColors.water} weight="fill" />}
              label="Air"
              value={volume(data?.water_ml ?? 0)}
              unit={'dari ' + volume(data?.targets.water_ml ?? 0)}
              progress={rasio(data?.water_ml ?? 0, data?.targets.water_ml)}
              color={metricColors.water}
              onPress={() => router.push('/log/water')}
            />
          </View>

          <View style={styles.grid}>
            <MetricTile
              icon={<MoonStarsIcon size={16} color={metricColors.sleep} weight="fill" />}
              label="Tidur"
              value={duration(data?.sleep_minutes ?? 0)}
              // Rentang, bukan satu angka, rekomendasinya memang 7-9 jam, dan
              // menampilkannya sebagai "8 jam tepat" memalsukan ketelitian yang
              // tidak dimiliki penelitiannya.
              unit={
                data
                  ? duration(data.targets.sleep.min_minutes) +
                    '–' +
                    duration(data.targets.sleep.max_minutes)
                  : undefined
              }
              progress={rasio(data?.sleep_minutes ?? 0, data?.targets.sleep.min_minutes)}
              color={metricColors.sleep}
              onPress={() => router.push('/log/sleep')}
            />
            <MetricTile
              icon={<BarbellIcon size={16} color={metricColors.workout} weight="fill" />}
              label="Olahraga"
              value={duration(data?.workout_minutes ?? 0)}
              // Durasi saja tidak menjawab pertanyaan yang sebenarnya dicari:
              // berapa yang terbakar. Keduanya ditampilkan berdampingan.
              unit={thousands(data?.workout_calories ?? 0) + ' kkal'}
              color={metricColors.workout}
              onPress={() => router.push('/log/workout')}
            />
          </View>

          <Card>
            <View style={styles.macroCard}>
              <SectionHeader
                title="Komposisi gizi"
                action={
                  <Text variant="caption" tone="tertiary">
                    {thousands(data?.calories_in ?? 0)} kkal
                  </Text>
                }
              />
              <MacroBar
                protein={data?.protein_g ?? 0}
                carbs={data?.carbs_g ?? 0}
                fat={data?.fat_g ?? 0}
              />
            </View>
          </Card>

          <Card onPress={() => router.push('/log/weight')}>
            <View style={styles.weightCard}>
              <View style={[styles.weightIcon, { backgroundColor: colors.primarySoft }]}>
                <ScalesIcon size={24} color={colors.primary} weight="duotone" />
              </View>

              <View style={styles.weightText}>
                <Text variant="label">
                  {data?.weight_kg === null || data?.weight_kg === undefined
                    ? 'Belum ditimbang hari ini'
                    : 'Berat hari ini tercatat'}
                </Text>
                <Text variant="caption" tone="secondary">
                  {data?.weight_kg === null || data?.weight_kg === undefined
                    ? 'Timbang pagi hari, sebelum makan, untuk angka paling konsisten'
                    : kg(data.weight_kg, 1) + ' kg'}
                </Text>
              </View>

              <ArrowRightIcon size={18} color={colors.textSecondary} weight="bold" />
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  greeting: { flex: 1, gap: 2 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noticeText: { flex: 1, gap: 2 },
  ringCard: { gap: spacing.xl, alignItems: 'stretch' },
  burnRow: { flexDirection: 'row', alignItems: 'center' },
  burnItem: { flex: 1, alignItems: 'center', gap: spacing.xs },
  burnDivider: { width: StyleSheet.hairlineWidth, height: 32, backgroundColor: colors.border },
  burnNote: { textAlign: 'center' },
  grid: { flexDirection: 'row', gap: spacing.md },
  macroCard: { gap: spacing.lg },
  weightCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  weightIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightText: { flex: 1, gap: 2 },
});
