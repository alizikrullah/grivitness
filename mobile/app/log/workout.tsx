import {
  BarbellIcon,
  CaretRightIcon,
  ImagesIcon,
  MagnifyingGlassIcon,
} from 'phosphor-react-native';
import {
  DistanceFields,
  RINCIAN_KOSONG,
  type RincianLari,
  detikDurasi,
  kkalLariJalan,
  rincianDariScan,
  rincianKeBody,
} from '@/components/features/DistanceFields';
import { LogActions } from '@/components/features/LogActions';
import { WorkoutEditSheet } from '@/components/features/WorkoutEditSheet';
import {
  UKURAN_BAWAAN,
  WorkoutMeasureFields,
  kkalPerMenitIntensitas,
  menitGerak,
  ringkasSesi,
  ukuranKeBody,
} from '@/components/features/WorkoutMeasureFields';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput, View } from 'react-native';

import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  Checkbox,
  ChipGroup,
  EmptyState,
  ErrorNote,
  Header,
  IconCircle,
  Input,
  Loading,
  Screen,
  SectionHeader,
  Sheet,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { useTanggalAwal } from '@/hooks/useTanggalAwal';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useCustomWorkouts,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsDate,
  useWorkoutsRange,
  type WorkoutInput,
} from '@/services/workouts.service';
import type {
  DistanceKind,
  WorkoutCategory,
  WorkoutIntensity,
  WorkoutLibraryItem,
  WorkoutLog,
  WorkoutMeasure,
  WorkoutScanResult,
} from '@/types';
import { useProfile } from '@/services/users.service';
import { useScanWorkout } from '@/services/workout-scan.service';
import { dayPhrase, shiftDays, todayWIB } from '@/utils/date';
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
  /** RUN/WALK: isiannya jarak, durasi, pace, dan HR. */
  jenis: DistanceKind | null;
}

const pilihanDariLibrary = (w: WorkoutLibraryItem): Pilihan => ({
  id: w.id,
  name: w.name,
  sumber: 'library',
  perMenit: toNum(w.calories_burned_per_minute) ?? 0,
  measure: w.measure,
  detikPerUlangan: w.seconds_per_rep,
  jenis: w.distance_kind ?? null,
});

/** Berat acuan nilai kkal/menit di library. Sama dengan BERAT_ACUAN_KG di backend. */
const BERAT_ACUAN_KG = 70;

export default function WorkoutScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [tanggal, setTanggal] = useState(useTanggalAwal());
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
  const [catatan, setCatatan] = useState('');
  const [terekam, setTerekam] = useState(false);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>('MEDIUM');
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<WorkoutLog | null>(null);
  const [rincian, setRincian] = useState<RincianLari>(RINCIAN_KOSONG);
  /** Hasil cek silang screenshot yang perlu dilihat sebelum menyimpan. */
  const [peringatan, setPeringatan] = useState<string[]>([]);

  const scan = useScanWorkout();
  const { dariGaleriBanyak, sibuk: memilih } = usePhotoPicker();
  // Dimuat sejak awal supaya hasil screenshot bisa langsung dicocokkan.
  const library = useWorkoutLibrary();

  // Urutan tombol "Berikutnya": nama tulis sendiri, ukuran, kalori, catatan.
  const kolomUkuran = useRef<TextInput>(null);
  const kolomKalori = useRef<TextInput>(null);
  const kolomCatatan = useRef<TextInput>(null);

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
  /**
   * Intensitas cuma berlaku untuk olahraga berukuran menit yang kalorinya
   * ditaksir aplikasi. Sesi yang terekam jam tangan atau kalorinya diketik
   * sendiri tidak memakainya, sama seperti backend.
   */
  /** Lari dan jalan: jarak, durasi, pace, HR menggantikan isian menit. */
  const jenis = measure === 'TIME' ? (pilihan?.jenis ?? null) : null;

  const pakaiIntensitas =
    measure === 'TIME' && !pakaiManual && !terekam && kaloriDiketik === null && jenis === null;

  /**
   * Lari dan jalan berjarak: kalori dari kecepatannya, cermin backend. Tanpa
   * jarak: kkal/menit library dikali durasinya. Olahraga lain seperti biasa.
   */
  const taksiranJarak = ((): number | null => {
    if (!pilihan || jenis === null) return null;
    const dariKecepatan = kkalLariJalan(rincian, jenis, beratKg);
    if (dariKecepatan !== null) return dariKecepatan;
    const detik = detikDurasi(rincian);
    return detik === null
      ? null
      : Math.round((pilihan.perMenit * (detik / 60) * beratKg) / BERAT_ACUAN_KG);
  })();

  const taksiran = !pilihan
    ? null
    : jenis !== null
      ? taksiranJarak
      : Math.round(
          (kkalPerMenitIntensitas(pilihan.perMenit, pakaiIntensitas ? intensitas : null) *
            menitGerak(measure, ukuran, pilihan.detikPerUlangan) *
            beratKg) /
            BERAT_ACUAN_KG,
        );

  /**
   * Screenshot jadi isian. Jenis olahraga, tanggal, durasi, jarak, pace, HR,
   * dan kalori TOTAL terisi; sesinya dianggap terekam jam tangan. Belum ada
   * yang tersimpan: user memeriksa lalu menekan Simpan.
   */
  const terapkanScan = (hasil: WorkoutScanResult) => {
    const lib = library.data?.find((w) => w.id === hasil.workout_library_id);
    if (lib) {
      setPilihan(pilihanDariLibrary(lib));
    } else if (hasil.workout_library_id && hasil.workout_name) {
      setPilihan({
        id: hasil.workout_library_id,
        name: hasil.workout_name,
        sumber: 'library',
        perMenit: 0,
        measure: hasil.measure ?? 'TIME',
        detikPerUlangan: null,
        jenis: hasil.distance_kind,
      });
    } else {
      setPilihan(null);
      setManual(hasil.workout_name ?? '');
    }

    if (hasil.logged_at) setTanggal(hasil.logged_at);
    setRincian(rincianDariScan(hasil));
    if (hasil.duration_seconds !== null) {
      const menit = Math.max(1, Math.round(hasil.duration_seconds / 60));
      setUkuran((u) => ({ ...u, menit }));
    }
    if (hasil.calories_total !== null) setKaloriDiketik(String(hasil.calories_total));
    setTerekam(true);
    setPeringatan(hasil.warnings);
  };

  const isiDariScreenshot = async () => {
    const uris = await dariGaleriBanyak(3);
    if (uris.length === 0) return;
    setError(null);
    scan.mutate(uris, {
      onSuccess: terapkanScan,
      onError: (e) => setError(toApiError(e).message),
    });
  };

  const kaloriTampil = kaloriDiketik ?? (taksiran === null ? '' : String(taksiran));

  const simpan = () => {
    setError(null);

    if (jenis !== null && detikDurasi(rincian) === null) {
      setError('Isi durasinya dulu');
      return;
    }

    const body: WorkoutInput = {
      // Lari dan jalan mengirim durasi dalam detik; backend menurunkan menitnya.
      ...(jenis !== null ? {} : ukuranKeBody(measure, ukuran)),
      ...rincianKeBody(rincian, jenis !== null),
      notes: catatan.trim() === '' ? undefined : catatan.trim(),
      tracked_by_device: terekam,
      ...(pakaiIntensitas ? { intensity: intensitas } : {}),
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
        setIntensitas('MEDIUM');
        setRincian(RINCIAN_KOSONG);
        setPeringatan([]);
      },
      onError: (e) => setError(toApiError(e).message),
    });
  };

  return (
    <>
      <Screen>
        <Header title="Olahraga" subtitle="Boleh lebih dari satu sesi per hari" />

        <DateNav value={tanggal} onChange={setTanggal} section="workout" />

        {/* Satu sampai tiga screenshot satu sesi dari aplikasi jam atau lari. */}
        <Button
          label={scan.isPending ? 'Membaca screenshot...' : 'Isi dari screenshot'}
          variant="secondary"
          icon={<ImagesIcon size={18} color={colors.textPrimary} weight="bold" />}
          onPress={() => void isiDariScreenshot()}
          loading={scan.isPending}
          disabled={memilih || scan.isPending}
        />

        <Pressable
          onPress={() => setSheet(true)}
          style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
        >
          {/* Wadah gelap, bukan latar tembus warna metrik (section 11). */}
          <IconCircle size={44} round={false}>
            <BarbellIcon size={22} color={metricColors.workout} weight="duotone" />
          </IconCircle>

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
            next={kolomUkuran}
            label="Atau tulis sendiri"
            value={manual}
            onChangeText={setManual}
            placeholder="Nama olahraga"
            autoCapitalize="sentences"
          />
        ) : null}

        {/* Bentuk isian mengikuti cara olahraganya diukur; push up tidak pernah ditanya menit. */}
        <Card>
          {jenis !== null ? (
            <DistanceFields value={rincian} onChange={setRincian} next={kolomKalori} />
          ) : (
            <View style={styles.isian}>
              <WorkoutMeasureFields
                measure={measure}
                value={ukuran}
                onChange={setUkuran}
                awal={kolomUkuran}
                next={kolomKalori}
                intensitas={intensitas}
                onIntensitas={pakaiIntensitas ? setIntensitas : undefined}
              />
              {/* HR olahraga lain cuma tampil kalau terbaca dari screenshot. */}
              {rincian.hr !== '' ? (
                <Input
                  label="HR rata-rata"
                  value={rincian.hr}
                  onChangeText={(hr) => setRincian({ ...rincian, hr: hr.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  suffix="bpm"
                />
              ) : null}
            </View>
          )}
        </Card>

        {/*
          Satu kolom kalori untuk semua sumber. Terisi taksiran begitu olahraga
          dipilih, dan bisa ditimpa: angka dari jam tangan, atau angka apa pun
          yang user lebih percaya. Dulu angka dari daftar tidak bisa diubah dan
          angka jam tangan tidak punya tempat.
        */}
        <Input
          ref={kolomKalori}
          next={kolomCatatan}
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
                ? jenis !== null
                  ? 'Taksiran dari jarak, durasi, dan berat badanmu. Ketik sendiri angka total dari jam tanganmu kalau ada.'
                  : measure === 'TIME'
                    ? 'Taksiran dari durasi, intensitas, dan berat badanmu. Ketik sendiri angka total dari jam tanganmu kalau ada.'
                    : 'Taksiran dari waktu gerak ulanganmu saja, jeda antar set tidak dihitung. Kecil itu wajar: nilai latihan ini di ototmu, bukan kalorinya.'
                : 'Angka ini disimpan apa adanya dan tidak dihitung ulang.'
          }
        />

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
          ref={kolomCatatan}
          label="Catatan"
          value={catatan}
          onChangeText={setCatatan}
          placeholder="Opsional"
          multiline
          maxLength={1000}
          autoCapitalize="sentences"
        />

        {/* Hasil cek silang screenshot: perlu dilihat sebelum menyimpan. */}
        {peringatan.map((p) => (
          <Text key={p} variant="caption" tone="warning">
            {p}
          </Text>
        ))}

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
                    {ringkasSesi(log)} · {thousands(log.calories_burned)} kkal
                  </Text>
                  {log.avg_hr !== null ||
                  log.tracked_by_device ||
                  log.calories_source === 'MANUAL' ? (
                    <Text variant="caption" tone="tertiary">
                      {[
                        log.avg_hr !== null ? 'HR ' + String(log.avg_hr) : null,
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

  // Riwayat 60 hari, untuk "Terakhir kamu lakukan" di paling atas.
  const hariIni = todayWIB();
  const riwayat = useWorkoutsRange(shiftDays(hariIni, -59), hariIni);

  const daftar: Pilihan[] = [
    ...(custom.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      sumber: 'custom' as const,
      perMenit: toNum(w.calories_burned_per_minute) ?? 0,
      measure: w.measure,
      detikPerUlangan: null,
      jenis: null,
    })),
    ...(library.data ?? []).map(pilihanDariLibrary),
  ];

  /**
   * Maksimal lima olahraga yang terakhir dicatat, terbaru dulu, supaya yang
   * biasa dilakukan tidak perlu dicari dengan menggulir. Cuma tampil selama
   * tidak sedang mencari atau menyaring kategori.
   */
  const terakhir: Pilihan[] = [];
  if (cari.trim() === '' && kategori === null) {
    const urut = [...(riwayat.data ?? [])].sort((a, b) =>
      a.logged_at === b.logged_at
        ? (b.created_at ?? '').localeCompare(a.created_at ?? '')
        : b.logged_at.localeCompare(a.logged_at),
    );
    for (const log of urut) {
      const cocok = daftar.find((p) =>
        p.sumber === 'library' ? p.id === log.workout_library_id : p.id === log.custom_workout_id,
      );
      if (cocok && !terakhir.some((t) => t.sumber === cocok.sumber && t.id === cocok.id)) {
        terakhir.push(cocok);
      }
      if (terakhir.length === 5) break;
    }
  }

  const barisPilihan = (item: Pilihan, kunciTambahan = '') => (
    <Pressable
      key={kunciTambahan + item.sumber + item.id}
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
  );

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

      {terakhir.length > 0 ? (
        <View style={styles.pickGroup}>
          <Text variant="overline" tone="tertiary">
            Terakhir kamu lakukan
          </Text>
          {terakhir.map((item) => barisPilihan(item, 'terakhir-'))}
        </View>
      ) : null}

      {library.isPending ? (
        <Loading />
      ) : daftar.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" message="Coba kata kunci lain." />
      ) : (
        <View style={styles.pickGroup}>
          {terakhir.length > 0 ? (
            <Text variant="overline" tone="tertiary">
              Semua olahraga
            </Text>
          ) : null}
          {daftar.map((item) => barisPilihan(item))}
        </View>
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
  pickerText: { flex: 1, gap: 2 },
  isian: { gap: spacing.md },
  pressed: { opacity: 0.75 },
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
  pickGroup: { gap: spacing.sm },
});
