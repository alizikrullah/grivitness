import { useRouter } from 'expo-router';
import {
  BarbellIcon,
  CameraIcon,
  DropIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  ScalesIcon,
  SmileyIcon,
  WatchIcon,
  type IconProps,
} from 'phosphor-react-native';
import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalendarSheet } from '@/components/features/CalendarSheet';
import { WeekStrip } from '@/components/features/WeekStrip';
import { Checkbox, IconCircle, Screen, Text } from '@/components/ui';
import { HeroTitle } from '@/components/ui/HeroTitle';
import { colors, metricColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { useCalendarDays, useDailySummary, useSetSickDay } from '@/services/misc.service';
import { dayPhrase, navDateLabel, shiftDays, shortDate, todayWIB, weekdayMon } from '@/utils/date';
import { duration, kg, thousands, volume } from '@/utils/format';

type Layar =
  | '/log/weight'
  | '/log/food'
  | '/log/workout'
  | '/log/steps'
  | '/log/water'
  | '/log/sleep'
  | '/log/device-energy'
  | '/log/mood'
  | '/log/body-photo';

interface LogEntry {
  layar: Layar;
  label: string;
  Icon: ComponentType<IconProps>;
  color: string;
  /** Keadaan di tanggal terpilih, atau "Belum diisi". */
  status: string;
  done: boolean;
}

/**
 * Halaman Catat: semua jenis catatan untuk SATU tanggal.
 *
 * Header-nya menjawab "hari mana yang belum gua isi": tanggal terpilih,
 * berapa catatan harian yang sudah terisi, dan strip sepekan yang titiknya
 * hijau (lengkap) atau kuning (baru sebagian). Hari yang terlewat karena sibuk
 * atau sakit kelihatan dari situ, lalu kartunya langsung membuka layar catat
 * di tanggal itu.
 *
 * "Catatan harian" adalah enam yang memang diharapkan terisi tiap hari:
 * makanan, minum, tidur, langkah, mood, jam tangan. Berat (ditimbang 2-4 kali
 * seminggu), olahraga (ada hari istirahat), dan foto badan (bulanan) ada di
 * "Lainnya" dan tidak membuat hari terbaca bolong. Aturan yang sama dipakai
 * backend untuk titik kalender (getCalendar, type catat).
 */
export default function LogHubScreen() {
  const router = useRouter();
  const [tanggal, setTanggal] = useState(todayWIB());
  const [kalender, setKalender] = useState(false);

  const summary = useDailySummary(tanggal);
  const senin = shiftDays(tanggal, -weekdayMon(tanggal));
  const pekan = useCalendarDays('catat', senin, shiftDays(senin, 6));
  const kuning = new Set(pekan.data?.incomplete ?? []);
  const hijau = new Set((pekan.data?.dates ?? []).filter((t) => !kuning.has(t)));

  const d = summary.data;
  const setSakit = useSetSickDay();
  // Selama permintaan berjalan, tampilkan yang baru dipilih, bukan yang lama.
  const sakit = setSakit.isPending ? (setSakit.variables?.sick ?? false) : d?.sick != null;
  const memuat = summary.isPending;
  const ada = d?.logged;

  const status = (terisi: boolean | undefined, teks: () => string): string =>
    memuat ? '...' : terisi ? teks() : 'Belum diisi';

  const harian: LogEntry[] = [
    {
      layar: '/log/food',
      label: 'Makanan',
      Icon: ForkKnifeIcon,
      color: metricColors.calories,
      status: status(ada?.food, () => thousands(d?.calories_in ?? 0) + ' kkal'),
      done: ada?.food ?? false,
    },
    {
      layar: '/log/water',
      label: 'Minum',
      Icon: DropIcon,
      color: metricColors.water,
      // Angka dan targetnya, supaya 500 ml di siang hari kelihatan masih jauh.
      status: status(
        ada?.water,
        () => volume(d?.water_ml ?? 0) + ' dari ' + volume(d?.targets.water_ml ?? 0),
      ),
      done: ada?.water ?? false,
    },
    {
      layar: '/log/sleep',
      label: 'Tidur',
      Icon: MoonStarsIcon,
      color: metricColors.sleep,
      status: status(ada?.sleep, () => duration(d?.sleep_minutes ?? 0)),
      done: ada?.sleep ?? false,
    },
    {
      layar: '/log/steps',
      label: 'Langkah',
      Icon: FootprintsIcon,
      color: metricColors.steps,
      status: status(ada?.steps, () => thousands(d?.steps ?? 0) + ' langkah'),
      done: ada?.steps ?? false,
    },
    {
      layar: '/log/mood',
      label: 'Mood',
      Icon: SmileyIcon,
      color: metricColors.mood,
      status: status(ada?.mood, () => 'Skor ' + String(d?.mood_score ?? '-') + '/5'),
      done: ada?.mood ?? false,
    },
    {
      layar: '/log/device-energy',
      label: 'Kalori jam',
      Icon: WatchIcon,
      color: metricColors.device,
      // Yang dihitung bagian AKTIF-nya, jadi itu yang disebut di sini.
      status: status(ada?.device, () =>
        d?.energy?.device_active_kcal != null
          ? 'aktif ' + thousands(d.energy.device_active_kcal) + ' kkal'
          : thousands(d?.device_kcal ?? 0) + ' kkal',
      ),
      done: ada?.device ?? false,
    },
  ];

  const lainnya: LogEntry[] = [
    {
      layar: '/log/weight',
      label: 'Berat badan',
      Icon: ScalesIcon,
      color: metricColors.weight,
      status: status(ada?.weight, () => kg(d?.weight_kg, 1) + ' kg'),
      done: ada?.weight ?? false,
    },
    {
      layar: '/log/workout',
      label: 'Olahraga',
      Icon: BarbellIcon,
      color: metricColors.workout,
      // Durasi saja tidak menjawab yang dicari: berapa yang terbakar.
      status: status(
        ada?.workout,
        () =>
          duration(d?.workout_minutes ?? 0) + ' · ' + thousands(d?.workout_calories ?? 0) + ' kkal',
      ),
      done: ada?.workout ?? false,
    },
    {
      layar: '/log/body-photo',
      label: 'Foto badan & pinggang',
      Icon: CameraIcon,
      color: metricColors.measurement,
      status: memuat ? '...' : ada?.body_photo ? 'Sudah difoto' : 'Cek 2-4 minggu sekali',
      done: ada?.body_photo ?? false,
    },
  ];

  const terisi = harian.filter((e) => e.done).length;
  const lengkap = !memuat && terisi === harian.length;

  const buka = (layar: Layar) => router.push({ pathname: layar, params: { date: tanggal } });

  const segarkan = () => {
    void summary.refetch();
    void pekan.refetch();
  };

  const kartu = (entry: LogEntry, wajib: boolean) => {
    const { Icon } = entry;
    return (
      <Pressable
        key={entry.label}
        onPress={() => buka(entry.layar)}
        style={({ pressed }) => [
          styles.tile,
          entry.done && styles.tileDone,
          pressed && styles.pressed,
        ]}
      >
        {/* Wadah gelap, ikonnya yang berwarna metrik (section 11). */}
        <IconCircle size={38}>
          <Icon size={20} color={entry.color} weight="fill" />
        </IconCircle>

        <View style={styles.tileText}>
          <Text variant="label" numberOfLines={1}>
            {entry.label}
          </Text>
          <Text
            variant="caption"
            // Catatan harian yang belum diisi dibuat oranye supaya menonjol;
            // yang tidak wajib tiap hari cukup redup.
            tone={entry.done ? 'success' : wajib && !memuat ? 'warning' : 'tertiary'}
            numberOfLines={1}
          >
            {entry.status}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen bottomInset refreshing={summary.isRefetching} onRefresh={segarkan}>
      <View style={styles.hero}>
        <Text variant="overline" tone="accent">
          {navDateLabel(tanggal)}
        </Text>
        <HeroTitle
          text={lengkap ? 'Sudah lengkap' : 'Belum lengkap'}
          highlight="lengkap"
          size="h1"
        />
        <Text variant="body" tone="secondary">
          {memuat
            ? 'Memuat catatan ' + dayPhrase(tanggal) + '...'
            : `${String(terisi)} dari ${String(harian.length)} catatan harian terisi.`}
        </Text>
      </View>

      <WeekStrip
        value={tanggal}
        onChange={setTanggal}
        onOpenCalendar={() => setKalender(true)}
        complete={hijau}
        partial={kuning}
      />

      {/*
        Tanda sakit, cuma konteks untuk chat dan overview: tidak ada hitungan
        yang berubah. Dicentang di hari pertama, berlaku terus sampai centangnya
        dihilangkan di hari sembuh. Keterangannya muncul hanya saat tercentang,
        karena saat itulah user perlu tahu cara mengakhirinya.
      */}
      <Checkbox
        label="Lagi sakit"
        checked={sakit}
        onChange={(nilai) => setSakit.mutate({ date: tanggal, sick: nilai })}
        hint={
          d?.sick
            ? 'Sakit sejak ' +
              shortDate(d.sick.start_date) +
              (d.sick.end_date ? ' sampai ' + shortDate(d.sick.end_date) : '') +
              '. Hilangkan centang di hari kamu sembuh.'
            : undefined
        }
      />

      <View style={styles.section}>
        <Text variant="overline" tone="tertiary">
          Catatan harian
        </Text>
        <View style={styles.grid}>{harian.map((e) => kartu(e, true))}</View>
      </View>

      <View style={styles.section}>
        <Text variant="overline" tone="tertiary">
          Lainnya
        </Text>
        <View style={styles.grid}>{lainnya.map((e) => kartu(e, false))}</View>
      </View>

      <CalendarSheet
        visible={kalender}
        onClose={() => setKalender(false)}
        value={tanggal}
        onSelect={(t) => {
          setTanggal(t);
          setKalender(false);
        }}
        section="catat"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md },
  section: { gap: spacing.md },
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
  tileText: { gap: 2 },
});
