import { BarbellIcon, ImagesIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useRef, useState } from 'react';

import {
  Button,
  Card,
  Checkbox,
  ChipGroup,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  SectionHeader,
} from '@/components/ui';
import {
  DistanceFields,
  RINCIAN_KOSONG,
  type RincianLari,
  detikDurasi,
  kkalLariJalan,
  rincianDariScan,
  rincianKeBody,
} from '@/components/features/DistanceFields';
import {
  UKURAN_BAWAAN,
  WorkoutMeasureFields,
  kkalPerMenitIntensitas,
  menitGerak,
  ringkasSesi,
  ukuranKeBody,
} from '@/components/features/WorkoutMeasureFields';
import { colors, metricColors } from '@/constants/colors';
import { CATEGORY_LABEL } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsDate,
  useWorkoutsRange,
} from '@/services/workouts.service';
import { DateNav } from '@/components/features/DateNav';
import { useTanggalLog } from '@/hooks/useTanggalLog';
import { useProfile } from '@/services/users.service';
import { useScanWorkout } from '@/services/workout-scan.service';
import type {
  WorkoutCategory,
  WorkoutIntensity,
  WorkoutLibraryItem,
  WorkoutScanResult,
} from '@/types';
import { dayPhrase, shiftDays, todayWIB } from '@/utils/date';
import { duration, thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

const KATEGORI = ['CARDIO', 'STRENGTH', 'FLEXIBILITY', 'SPORTS', 'OTHER'] as const;

/** Berat acuan nilai kkal/menit di library. Sama dengan BERAT_ACUAN_KG di backend. */
const BERAT_ACUAN_KG = 70;

export const WorkoutPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useTanggalLog();
  const hariIni = tanggal === todayWIB();

  const today = useWorkoutsDate(tanggal);
  const create = useCreateWorkout();
  const hapus = useDeleteWorkout();

  /** Berat badan untuk menaksir kalori dari nilai library yang acuannya 70 kg. */
  const beratKg = useProfile().data?.current_weight_kg ?? BERAT_ACUAN_KG;

  const [kategori, setKategori] = useState<WorkoutCategory>('CARDIO');
  const [cari, setCari] = useState('');
  const library = useWorkoutLibrary(kategori, cari.trim() || undefined);

  const [dipilih, setDipilih] = useState<WorkoutLibraryItem | null>(null);
  const [ukuran, setUkuran] = useState(UKURAN_BAWAAN);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>('MEDIUM');
  const [terekam, setTerekam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rincian, setRincian] = useState<RincianLari>(RINCIAN_KOSONG);
  /** Hasil cek silang screenshot yang perlu dilihat sebelum menyimpan. */
  const [peringatan, setPeringatan] = useState<string[]>([]);
  const scan = useScanWorkout();
  const pemilihBerkas = useRef<HTMLInputElement>(null);

  /**
   * Maksimal lima olahraga yang terakhir dicatat dalam 60 hari, terbaru dulu,
   * supaya yang biasa dilakukan tidak perlu dicari lewat kategori. Padanan
   * mobile; olahraga custom tidak ada di panel web, jadi tidak ikut.
   */
  const tanggalHariIni = todayWIB();
  const riwayat = useWorkoutsRange(shiftDays(tanggalHariIni, -59), tanggalHariIni);
  const semuaLibrary = useWorkoutLibrary();
  const terakhir: WorkoutLibraryItem[] = [];
  const urutTerbaru = [...(riwayat.data ?? [])].sort((a, b) =>
    a.logged_at === b.logged_at
      ? (b.created_at ?? '').localeCompare(a.created_at ?? '')
      : b.logged_at.localeCompare(a.logged_at),
  );
  for (const log of urutTerbaru) {
    const cocok = semuaLibrary.data?.find((w) => w.id === log.workout_library_id);
    if (cocok && !terakhir.some((t) => t.id === cocok.id)) terakhir.push(cocok);
    if (terakhir.length === 5) break;
  }

  /**
   * Kolom kalori punya dua keadaan: masih taksiran, atau sudah disentuh user.
   *
   * Selama belum disentuh, isinya mengikuti pilihan dan durasi, dan saat
   * disimpan TIDAK dikirim, biar backend menghitungnya dari MET dan
   * menandainya taksiran. Begitu user mengetik, angka itulah yang dikirim dan
   * backend menandainya MANUAL, misalnya angka dari jam tangan. Kalau
   * taksiran ikut dikirim, backend mengira user yang mengetiknya dan menolak
   * menghitung ulang saat durasinya nanti dibetulkan.
   */
  const [kaloriDiketik, setKaloriDiketik] = useState<string | null>(null);

  /**
   * Intensitas cuma berlaku untuk olahraga berukuran menit yang kalorinya
   * ditaksir aplikasi. Sesi yang terekam jam tangan atau kalorinya diketik
   * sendiri tidak memakainya, sama seperti backend.
   */
  /** Lari dan jalan: jarak, durasi, pace, HR menggantikan isian menit. */
  const jenis = dipilih?.measure === 'TIME' ? (dipilih.distance_kind ?? null) : null;

  const pakaiIntensitas =
    dipilih?.measure === 'TIME' && !terekam && kaloriDiketik === null && jenis === null;

  const perMenit = toNum(dipilih?.calories_burned_per_minute) ?? 0;

  // Taksiran dari MENIT GERAK, cermin perhitungan backend: untuk repetisi
  // itu ulangan x detik per ulangan, jeda antar set tidak dihitung. Lari dan
  // jalan berjarak dari kecepatannya; tanpa jarak, kkal/menit x durasi.
  const taksiran = ((): number | null => {
    if (!dipilih) return null;
    if (jenis !== null) {
      const dariKecepatan = kkalLariJalan(rincian, jenis, beratKg);
      if (dariKecepatan !== null) return dariKecepatan;
      const detik = detikDurasi(rincian);
      return detik === null
        ? null
        : Math.round((perMenit * (detik / 60) * beratKg) / BERAT_ACUAN_KG);
    }
    return Math.round(
      (kkalPerMenitIntensitas(perMenit, pakaiIntensitas ? intensitas : null) *
        menitGerak(dipilih.measure, ukuran, dipilih.seconds_per_rep) *
        beratKg) /
        BERAT_ACUAN_KG,
    );
  })();

  /**
   * Screenshot jadi isian, padanan mobile. Jenis olahraga, tanggal, durasi,
   * jarak, pace, HR, dan kalori TOTAL terisi; sesinya dianggap terekam jam.
   * Belum ada yang tersimpan sampai Simpan ditekan.
   */
  const terapkanScan = (hasil: WorkoutScanResult) => {
    const lib = semuaLibrary.data?.find((w) => w.id === hasil.workout_library_id);
    setDipilih(lib ?? null);
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

  const isiDariScreenshot = (daftar: FileList | null) => {
    const berkas = Array.from(daftar ?? []).slice(0, 3);
    if (berkas.length === 0) return;
    setError(null);
    scan.mutate(berkas, {
      onSuccess: terapkanScan,
      onError: (e) => setError(toApiError(e).message),
    });
  };

  const kaloriTampil = kaloriDiketik ?? (taksiran === null ? '' : String(taksiran));

  const simpan = () => {
    setError(null);

    if (!dipilih) {
      setError('Pilih jenis olahraga dulu');
      return;
    }

    let kalori: number | undefined;

    if (kaloriDiketik !== null) {
      const angka = Number(kaloriTampil);

      if (kaloriTampil.trim() === '' || !Number.isFinite(angka) || angka < 0) {
        setError('Isi kalori terbakar');
        return;
      }

      kalori = Math.round(angka);
    }

    if (jenis !== null && detikDurasi(rincian) === null) {
      setError('Isi durasinya dulu');
      return;
    }

    create.mutate(
      {
        workout_library_id: dipilih.id,
        // Lari dan jalan mengirim durasi dalam detik; backend menurunkan menitnya.
        ...(jenis !== null ? {} : ukuranKeBody(dipilih.measure, ukuran)),
        ...rincianKeBody(rincian, jenis !== null),
        tracked_by_device: terekam,
        ...(pakaiIntensitas ? { intensity: intensitas } : {}),
        ...(kalori === undefined ? {} : { calories_burned: kalori }),
        // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
        logged_at: hariIni ? undefined : tanggal,
      },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          setDipilih(null);
          setKaloriDiketik(null);
          setTerekam(false);
          setIntensitas('MEDIUM');
          setRincian(RINCIAN_KOSONG);
          setPeringatan([]);
        },
      },
    );
  };

  return (
    <>
      <SectionHeader title="Catat olahraga" />

      <DateNav value={tanggal} onChange={setTanggal} section="workout" />

      <Card>
        <div className="stack">
          {/* Satu sampai tiga screenshot satu sesi dari aplikasi jam atau lari. */}
          <input
            ref={pemilihBerkas}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              isiDariScreenshot(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            label={scan.isPending ? 'Membaca screenshot…' : 'Isi dari screenshot'}
            variant="secondary"
            icon={<ImagesIcon size={18} weight="bold" />}
            onClick={() => pemilihBerkas.current?.click()}
            loading={scan.isPending}
            disabled={scan.isPending}
          />

          {terakhir.length > 0 && cari.trim() === '' ? (
            <div className="stack-xs">
              <span className="t-overline c-tertiary">Terakhir kamu lakukan</span>
              <div className="chip-group">
                {terakhir.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDipilih(item)}
                    aria-pressed={dipilih?.id === item.id}
                    className={'chip' + (dipilih?.id === item.id ? ' chip-active' : '')}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ChipGroup
            options={KATEGORI}
            value={kategori}
            onChange={setKategori}
            labels={CATEGORY_LABEL}
          />

          <Input
            placeholder="Cari olahraga…"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            icon={<MagnifyingGlassIcon size={16} color={colors.textSecondary} />}
          />

          {library.isPending ? (
            <Loading />
          ) : (
            <div className="chip-group">
              {library.data?.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDipilih(item)}
                  aria-pressed={dipilih?.id === item.id}
                  className={'chip' + (dipilih?.id === item.id ? ' chip-active' : '')}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}

          {dipilih ? (
            <>
              {/* Bentuk isian mengikuti cara olahraganya diukur; push up tidak pernah ditanya menit. */}
              {jenis !== null ? (
                <DistanceFields value={rincian} onChange={setRincian} />
              ) : (
                <>
                  <WorkoutMeasureFields
                    measure={dipilih.measure}
                    value={ukuran}
                    onChange={setUkuran}
                    nama={dipilih.name}
                    intensitas={intensitas}
                    onIntensitas={pakaiIntensitas ? setIntensitas : undefined}
                  />
                  {/* HR olahraga lain cuma tampil kalau terbaca dari screenshot. */}
                  {rincian.hr !== '' ? (
                    <Input
                      label="HR rata-rata"
                      inputMode="numeric"
                      value={rincian.hr}
                      onChange={(e) =>
                        setRincian({ ...rincian, hr: e.target.value.replace(/[^0-9]/g, '') })
                      }
                      suffix="bpm"
                    />
                  ) : null}
                </>
              )}

              {/*
                Satu kolom kalori, terisi taksiran dan bisa ditimpa: angka dari
                jam tangan, atau angka apa pun yang user lebih percaya. Dulu
                angkanya cuma ditampilkan dan tidak bisa diubah.
              */}
              <Input
                label="Kalori terbakar"
                inputMode="numeric"
                value={kaloriTampil}
                onChange={(e) => setKaloriDiketik(e.target.value.replace(/[^0-9]/g, ''))}
                suffix="kkal"
                hint={
                  kaloriDiketik === null
                    ? dipilih.measure === 'TIME'
                      ? jenis !== null
                        ? 'Taksiran dari jarak, durasi, dan berat badanmu. Ketik sendiri angka total dari jam tanganmu kalau ada.'
                        : 'Taksiran dari durasi, intensitas, dan berat badanmu. Ketik sendiri angka total dari jam tanganmu kalau ada.'
                      : 'Taksiran dari waktu gerak ulanganmu saja, jeda antar set tidak dihitung. Kecil itu wajar: nilai latihan ini di ototmu, bukan kalorinya.'
                    : 'Angka ini disimpan apa adanya dan tidak dihitung ulang.'
                }
              />

              {/*
                SELALU tampil, tidak lagi menunggu angka harian jam diisi. Dulu
                cuma muncul kalau angka smartwatch hari itu sudah ada, padahal
                urutan nyatanya terbalik: sesi dicatat siang, angka jam diisi
                malam. Sesi jadi tersimpan "tidak terekam" lalu ditambahkan lagi
                di atas angka jam yang sudah memuatnya.

                Centangan ini baru berpengaruh kalau angka jam hari itu ada.
                Tanpa angka jam, sesi tetap dihitung penuh.
              */}
              <Checkbox
                label="Sesi ini terekam jam tangan"
                checked={terekam}
                onChange={setTerekam}
                hint="Kalorinya sudah ada di dalam angka aktif jam hari itu, jadi tidak ditambah lagi."
              />
            </>
          ) : null}

          {/* Hasil cek silang screenshot: perlu dilihat sebelum menyimpan. */}
          {peringatan.map((p) => (
            <span key={p} className="t-caption c-warning">
              {p}
            </span>
          ))}

          {error ? <ErrorNote message={error} /> : null}

          <Button
            label="Simpan"
            size="lg"
            full
            onClick={simpan}
            loading={create.isPending}
            disabled={!dipilih}
          />
        </div>
      </Card>

      <SectionHeader title={'Olahraga ' + dayPhrase(tanggal)} />

      {today.isPending ? (
        <Loading />
      ) : (today.data?.logs.length ?? 0) === 0 ? (
        <EmptyState
          icon={<BarbellIcon size={28} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada olahraga"
          message="Pilih jenis olahraga di atas untuk mencatat."
        />
      ) : (
        <Card padding="md">
          <div>
            <div className="row-between" style={{ paddingBottom: 'var(--space-md)' }}>
              <span className="t-caption c-secondary">Total</span>
              <span className="t-h3">
                {duration(today.data?.total_minutes ?? 0)} ·{' '}
                {thousands(today.data?.total_calories ?? 0)} kkal
              </span>
            </div>

            {today.data?.logs.map((log) => (
              <div key={log.id} className="log-row">
                <span className="log-row-icon">
                  <BarbellIcon size={16} color={metricColors.workout} weight="fill" />
                </span>

                <span className="flex-1">
                  <span className="t-body-medium">{log.workout_name}</span>
                  <span className="t-caption c-tertiary">
                    {' '}
                    · {ringkasSesi(log)} · {thousands(log.calories_burned)} kkal
                    {log.avg_hr !== null ? ' · HR ' + String(log.avg_hr) : ''}
                    {log.tracked_by_device ? ' · terekam jam' : ''}
                    {log.calories_source === 'MANUAL' ? ' · kalori diisi sendiri' : ''}
                  </span>
                </span>

                <LogActions
                  onDelete={() =>
                    hapus.mutate(log.id, { onError: (e) => setError(toApiError(e).message) })
                  }
                  confirmMessage={'Hapus catatan ' + log.workout_name + '?'}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
};
