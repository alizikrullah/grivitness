import { useRouter, type Href } from 'expo-router';
import {
  BarbellIcon,
  CameraIcon,
  DropIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  RulerIcon,
  ScalesIcon,
  SmileyIcon,
  WatchIcon,
  type IconProps,
} from 'phosphor-react-native';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, Text } from '@/components/ui';
import { HeroTitle } from '@/components/ui/HeroTitle';
import { colors, metricColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { useDailySummary } from '@/services/misc.service';
import { todayWIB } from '@/utils/date';
import { duration, thousands, volume } from '@/utils/format';

interface LogEntry {
  href: Href;
  label: string;
  Icon: ComponentType<IconProps>;
  color: string;
  /** Keterangan keadaan hari ini, diisi dari ringkasan harian. */
  status: string;
  done: boolean;
}

export default function LogHubScreen() {
  const router = useRouter();
  const summary = useDailySummary(todayWIB());
  const d = summary.data;

  const entries: LogEntry[] = [
    {
      href: '/log/weight',
      label: 'Berat badan',
      Icon: ScalesIcon,
      color: metricColors.weight,
      status: d?.weight_kg != null ? d.weight_kg.toFixed(1) + ' kg' : 'Belum dicatat',
      done: d?.weight_kg != null,
    },
    {
      href: '/log/food',
      label: 'Makanan',
      Icon: ForkKnifeIcon,
      color: metricColors.calories,
      status:
        (d?.calories_in ?? 0) > 0 ? thousands(d?.calories_in ?? 0) + ' kkal' : 'Belum dicatat',
      done: (d?.calories_in ?? 0) > 0,
    },
    {
      href: '/log/workout',
      label: 'Olahraga',
      Icon: BarbellIcon,
      color: metricColors.workout,
      // Durasi saja tidak menjawab yang dicari: berapa yang terbakar. Sama
      // seperti di beranda, keduanya ditampilkan berdampingan.
      status:
        (d?.workout_minutes ?? 0) > 0
          ? duration(d?.workout_minutes ?? 0) +
            ' · ' +
            thousands(d?.workout_calories ?? 0) +
            ' kkal'
          : 'Belum dicatat',
      done: (d?.workout_minutes ?? 0) > 0,
    },
    {
      href: '/log/steps',
      label: 'Langkah',
      Icon: FootprintsIcon,
      color: metricColors.steps,
      status: (d?.steps ?? 0) > 0 ? thousands(d?.steps ?? 0) + ' langkah' : 'Belum dicatat',
      done: (d?.steps ?? 0) > 0,
    },
    {
      href: '/log/water',
      label: 'Minum',
      Icon: DropIcon,
      color: metricColors.water,
      status: (d?.water_ml ?? 0) > 0 ? volume(d?.water_ml ?? 0) : 'Belum dicatat',
      done: (d?.water_ml ?? 0) > 0,
    },
    {
      href: '/log/sleep',
      label: 'Tidur',
      Icon: MoonStarsIcon,
      color: metricColors.sleep,
      status: (d?.sleep_minutes ?? 0) > 0 ? duration(d?.sleep_minutes ?? 0) : 'Belum dicatat',
      done: (d?.sleep_minutes ?? 0) > 0,
    },
    {
      href: '/log/device-energy',
      label: 'Kalori jam',
      Icon: WatchIcon,
      color: metricColors.device,
      status: d?.device_kcal != null ? thousands(d.device_kcal) + ' kkal' : 'Belum dicatat',
      done: d?.device_kcal != null,
    },
    {
      href: '/log/mood',
      label: 'Mood',
      Icon: SmileyIcon,
      color: metricColors.mood,
      status: d?.mood_score != null ? 'Skor ' + d.mood_score + '/5' : 'Belum dicatat',
      done: d?.mood_score != null,
    },
    {
      href: '/log/body-photo',
      label: 'Foto badan',
      Icon: CameraIcon,
      color: metricColors.measurement,
      status: d?.has_body_photo ? 'Sudah difoto' : 'Belum dicatat',
      done: d?.has_body_photo ?? false,
    },
    {
      href: '/log/measurements',
      label: 'Ukuran badan',
      Icon: RulerIcon,
      color: metricColors.measurement,
      status: 'Catat berkala',
      done: false,
    },
  ];

  const selesai = entries.filter((e) => e.done).length;

  return (
    <Screen bottomInset refreshing={summary.isRefetching} onRefresh={() => void summary.refetch()}>
      <View style={styles.hero}>
        <Text variant="overline" tone="accent">
          Catat hari ini
        </Text>
        <HeroTitle text="Belum lengkap" highlight="lengkap" size="h1" />
        <Text variant="body" tone="secondary">
          {selesai} dari {entries.length} sudah tercatat hari ini.
        </Text>
      </View>

      <View style={styles.grid}>
        {entries.map((entry) => {
          const { Icon } = entry;

          return (
            <Pressable
              key={entry.label}
              onPress={() => router.push(entry.href)}
              style={({ pressed }) => [
                styles.tile,
                entry.done && styles.tileDone,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.icon, { backgroundColor: entry.color }]}>
                <Icon size={22} color={colors.background} weight="fill" />
              </View>

              <View style={styles.tileText}>
                <Text variant="label" numberOfLines={1}>
                  {entry.label}
                </Text>
                <Text
                  variant="caption"
                  tone={entry.done ? 'success' : 'tertiary'}
                  numberOfLines={1}
                >
                  {entry.status}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: '47.8%',
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  tileDone: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { gap: 2 },
});
