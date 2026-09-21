import { BarbellIcon, CaretRightIcon, MagnifyingGlassIcon } from 'phosphor-react-native';
import { LogActions } from '@/components/features/LogActions';
import { WorkoutEditSheet } from '@/components/features/WorkoutEditSheet';
import {
  UKURAN_BAWAAN,
  WorkoutMeasureFields,
  menitGerak,
  ringkasSesi,
  ukuranKeBody,
} from '@/components/features/WorkoutMeasureFields';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Checkbox,
  ChipGroup,
  DateStrip,
  EmptyState,
  ErrorNote,
  Header,
  Input,
  Loading,
  Screen,
  SectionHeader,
  Sheet,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import {
  CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  INTENSITY_LABEL,
  INTENSITY_OPTIONS,
} from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useCustomWorkouts,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsDate,
  type WorkoutInput,
} from '@/services/workouts.service';
import type { WorkoutCategory, WorkoutIntensity, WorkoutLog, WorkoutMeasure } from '@/types';
import { useProfile } from '@/services/users.service';
import { dayPhrase, todayWIB } from '@/utils/date';
import { duration, thousands, toNum } from '@/utils/format';

/** Olahraga yang dipilih user, apa pun sumbernya. */
interface Pilihan {
  id: string;
  name: string;
  sumber: 'library' | 'custom';
  perMenit: number;
  /** Menentukan bentuk isian: menit, set x ulangan, atau set x detik. */
  measure: WorkoutMeasure;
  detikPerUlangan: number | null;
}

/** Berat acuan nilai kkal/menit di library. Sama dengan BERAT_ACUAN_KG di backend. */
const BERAT_ACUAN_KG = 70;

export default function WorkoutScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [tanggal, setTanggal] = useState(todayWIB());
  const hariIni = tanggal === todayWIB();

  const today = useWorkoutsDate(tanggal);
  const createWorkout = useCreateWorkout();
  const deleteWorkout = useDeleteWorkout();

  /** Berat badan untuk menaksir kalori dari nilai library yang acuannya 70 kg. */
  const beratKg = useProfile().data?.current_weight_kg ?? BERAT_ACUAN_KG;

  const [sheet, setSheet] = useState(false);
  const [pilihan, setPilihan] = useState<Pilihan | null>(null);
  const [manual, setManual] = useState('');
  const [ukuran, setUkuran] = useState(UKURAN_BAWAAN);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>('MEDIUM');
  const [catatan, setCatatan] = useState('');
  const [terekam, setTerekam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<WorkoutLog | null>(null);

  /**
   * Kolom kalori punya dua keadaan: masih taksiran, atau sudah disentuh user.
   *
   * Selama belum disentuh, isinya mengikuti pilihan olahraga dan durasi, dan
   * saat disimpan TIDAK dikirim, biar backend menghitungnya sendiri dari MET
   * dan menandainya sebagai taksiran. Begitu user mengetik, angka itulah yang
   * dikirim dan backend menandainya MANUAL, misalnya angka dari jam tangan.
   *
   * Kalau taksiran ikut dikirim, backend akan mengira user yang mengetiknya
   * dan menolak menghitung ulang saat durasinya nanti dibetulkan.
   */
  const [kaloriDiketik, setKaloriDiketik] = useState<string | null>(null);

  const pakaiManual = pilihan === null;

  // Olahraga tulis sendiri tidak punya cara ukur dari library: menit.
  const measure: WorkoutMeasure = pilihan?.measure ?? 'TIME';

  // Taksiran dari MENIT GERAK, cermin perhitungan backend: untuk repetisi
  // itu ulangan x detik per ulangan, jeda antar set tidak dihitung. Lima push
  // up memang cuma sekitar 2 kkal, dan angka kecil itu jujur.
  const taksiran = pilihan
    ? Math.round(
        (pilihan.perMenit * menitGerak(measure, ukuran, pilihan.detikPerUlangan) * beratKg) /
          BERAT_ACUAN_KG,
      )
    : null;

  const kaloriTampil = kaloriDiketik ?? (taksiran === null ? '' : String(taksiran));

  const simpan = () => {
    setError(null);

    const body: WorkoutInput = {
      ...ukuranKeBody(measure, ukuran),
      intensity: intensitas,
      notes: catatan.trim() === '' ? undefined : catatan.trim(),
      tracked_by_device: terekam,
      // Saat menelusuri hari lampau, sesi dicatat ke tanggal ITU.
      logged_at: hariIni ? undefined : tanggal,
    };

    if (pilihan) {
      if (pilihan.sumber === 'library') body.workout_library_id = pilihan.id;
      else body.custom_workout_id = pilihan.id;
    } else {
      const nama = manual.trim();

      if (nama.length < 2) {
        setError('Isi nama olahraga, atau pilih dari daftar');
        return;
      }

      body.workout_name = nama;
    }

    // Olahraga tulis sendiri tidak punya MET untuk dirujuk, jadi kalorinya
    // wajib. Untuk pilihan dari daftar, hanya dikirim kalau user mengetiknya.
    if (pakaiManual || kaloriDiketik !== null) {
      const kalori = Number(kaloriTampil);

      if (kaloriTampil.trim() === '' || !Number.isFinite(kalori) || kalori < 0) {
        setError('Isi kalori terbakar');
        return;
      }

      body.calories_burned = Math.round(kalori);
    }

    createWorkout.mutate(body, {
      onSuccess: () => {
        setPilihan(null);
        setManual('');
        setKaloriDiketik(null);
        setCatatan('');
        setTerekam(false);
      },
      onError: (e) => setError(toApiError(e).message),
    });
  };

  return (
    <>
      <Screen>
        <Header title="Olahraga" subtitle="Boleh lebih dari satu sesi per hari" />

        <DateStrip value={tanggal} onChange={setTanggal} />

        <Pressable
          onPress={() => setSheet(true)}
          style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
        >
          <View style={[styles.pickerIcon, { backgroundColor: metricColors.workout + '1F' }]}>
            <BarbellIcon size={22} color={metricColors.workout} weight="duotone" />
          </View>

          <View style={styles.pickerText}>
            <Text variant="caption" tone="tertiary">
              Jenis olahraga
            </Text>
            <Text variant="label" numberOfLines={1}>
              {pilihan?.name ?? 'Pilih dari daftar'}
            </Text>
          </View>

          <CaretRightIcon size={18} color={colors.textSecondary} weight="bold" />
        </Pressable>

        {pakaiManual ? (
          <Input
            label="Atau tulis sendiri"
            value={manual}
            onChangeText={setManual}
            placeholder="Nama olahraga"
            autoCapitalize="sentences"
          />
        ) : null}

        {/* Bentuk isian mengikuti cara olahraganya diukur; push up tidak pernah ditanya menit. */}
        <Card>
          <WorkoutMeasureFields measure={measure} value={ukuran} onChange={setUkuran} />
        </Card>

        {/*
          Satu kolom kalori untuk semua sumber. Terisi taksiran begitu olahraga
          dipilih, dan bisa ditimpa: angka dari jam tangan, atau angka apa pun
          yang user lebih percaya. Dulu angka dari daftar tidak bisa diubah dan
          angka jam tangan tidak punya tempat.
        */}
        <Input
          label="Kalori terbakar"
          value={kaloriTampil}
          onChangeText={setKaloriDiketik}
          placeholder={pakaiManual ? '200' : ''}
          keyboardType="number-pad"
          suffix="kkal"
          hint={
            pakaiManual
              ? 'Wajib diisi untuk olahraga yang ditulis sendiri.'
              : kaloriDiketik === null
                ? measure === 'TIME'
                  ? 'Taksiran dari durasi dan berat badanmu. Ketik sendiri kalau jam tanganmu menunjukkan angka lain.'
                  : 'Taksiran dari waktu gerak ulanganmu saja, jeda antar set tidak dihitung. Kecil itu wajar: nilai latihan ini di ototmu, bukan kalorinya.'
                : 'Angka ini disimpan apa adanya dan tidak dihitung ulang.'
          }
        />

        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Intensitas
          </Text>
          <ChipGroup
            options={INTENSITY_OPTIONS}
            value={intensitas}
            onChange={setIntensitas}
            labels={INTENSITY_LABEL}
            wrap
          />
        </View>

        {/*
          SELALU tampil, tidak lagi menunggu angka harian jam diisi.

          Dulu pertanyaan ini cuma muncul kalau hari itu sudah ada angka
          smartwatch. Padahal urutan nyatanya terbalik: sesi dicatat siang,
          angka jam diisi malam. Sesi jadi tersimpan "tidak terekam" lalu
          ditambahkan lagi di atas angka jam yang sudah memuatnya, dan jalan
          yang sama dihitung dua kali.

          Centangan ini baru berpengaruh kalau angka jam hari itu ada. Tanpa
          angka jam, sesi tetap dihitung penuh, jadi tidak ada yang hilang.
        */}
        <Checkbox
          label="Sesi ini terekam jam tangan"
          checked={terekam}
          onChange={setTerekam}
          hint="Kalorinya sudah ada di dalam angka aktif jam hari itu, jadi tidak ditambah lagi."
        />

        <Input
          label="Catatan"
          value={catatan}
          onChangeText={setCatatan}
          placeholder="Opsional"
          multiline
          maxLength={1000}
          autoCapitalize="sentences"
        />

        {error ? <ErrorNote message={error} /> : null}

        <Button
          label="Simpan olahraga"
          onPress={simpan}
          loading={createWorkout.isPending}
          size="lg"
        />

        <SectionHeader
          title={dayPhrase(tanggal) === 'hari ini' ? 'Hari ini' : dayPhrase(tanggal)}
          action={
            <Text variant="caption" tone="tertiary">
              {duration(today.data?.total_minutes ?? 0)} ·{' '}
              {thousands(today.data?.total_calories ?? 0)} kkal
            </Text>
          }
        />

        {today.isPending ? (
          <Loading />
        ) : (today.data?.logs.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BarbellIcon size={30} color={colors.textTertiary} weight="duotone" />}
            title="Belum ada olahraga"
            message="Pilih jenis olahraga di atas lalu simpan."
          />
        ) : (
          today.data?.logs.map((log) => (
            <Card key={log.id} padding="md">
              <View style={styles.logRow}>
                <View style={styles.logText}>
                  <Text variant="label" numberOfLines={1}>
                    {log.workout_name}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {ringkasSesi(log)} · {thousands(log.calories_burned)} kkal ·{' '}
                    {INTENSITY_LABEL[log.intensity]}
                  </Text>
                  {log.tracked_by_device || log.calories_source === 'MANUAL' ? (
                    <Text variant="caption" tone="tertiary">
                      {[
                        log.tracked_by_device ? 'Terekam jam tangan' : null,
                        log.calories_source === 'MANUAL' ? 'Kalori diisi sendiri' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>

                <LogActions
                  onEdit={() => setDiedit(log)}
                  onDelete={() => deleteWorkout.mutate(log.id)}
                  deleteMessage={
                    log.workout_name + ' akan dihapus dari catatan ' + dayPhrase(tanggal) + '.'
                  }
                />
              </View>
            </Card>
          ))
        )}

        <WorkoutPicker
          visible={sheet}
          onClose={() => setSheet(false)}
          onPick={(p) => {
            setPilihan(p);
            setSheet(false);
          }}
        />
      </Screen>

      {diedit ? (
        <WorkoutEditSheet key={diedit.id} log={diedit} onClose={() => setDiedit(null)} />
      ) : null}
    </>
  );
}

const WorkoutPicker = ({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (pilihan: Pilihan) => void;
}) => {
  const [kategori, setKategori] = useState<WorkoutCategory | null>(null);
  const [cari, setCari] = useState('');

  const library = useWorkoutLibrary(kategori ?? undefined, cari);
  const custom = useCustomWorkouts();

  const daftar: Pilihan[] = [
    ...(custom.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      sumber: 'custom' as const,
      perMenit: toNum(w.calories_burned_per_minute) ?? 0,
      measure: w.measure,
      detikPerUlangan: null,
    })),
    ...(library.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      sumber: 'library' as const,
      perMenit: toNum(w.calories_burned_per_minute) ?? 0,
      measure: w.measure,
      detikPerUlangan: w.seconds_per_rep,
    })),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Pilih olahraga">
      <Input
        value={cari}
        onChangeText={setCari}
        placeholder="Cari olahraga"
        icon={<MagnifyingGlassIcon size={18} color={colors.textSecondary} weight="bold" />}
      />

      <ChipGroup
        options={CATEGORY_OPTIONS}
        value={kategori}
        onChange={(k) => setKategori(kategori === k ? null : k)}
        labels={CATEGORY_LABEL}
      />

      {library.isPending ? (
        <Loading />
      ) : daftar.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" message="Coba kata kunci lain." />
      ) : (
        daftar.map((item) => (
          <Pressable
            key={item.sumber + item.id}
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.pickItem, pressed && styles.pressed]}
          >
            <View style={styles.pickText}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="caption" tone="tertiary">
                {item.measure === 'REPS'
                  ? 'set x ulangan'
                  : item.measure === 'HOLD'
                    ? 'set x detik tahan'
                    : item.perMenit.toFixed(1) + ' kkal/menit'}
                {item.sumber === 'custom' ? ' · custom' : ''}
              </Text>
            </View>
            <CaretRightIcon size={16} color={colors.textTertiary} weight="bold" />
          </Pressable>
        ))
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.75 },
  group: { gap: spacing.md },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logText: { flex: 1, gap: 2 },
  pickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  pickText: { flex: 1, gap: 2 },
});
