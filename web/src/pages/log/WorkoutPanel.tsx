import { BarbellIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  Button,
  Card,
  Checkbox,
  ChipGroup,
  DateField,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  SectionHeader,
} from '@/components/ui';
import {
  UKURAN_BAWAAN,
  WorkoutMeasureFields,
  menitGerak,
  ringkasSesi,
  ukuranKeBody,
} from '@/components/features/WorkoutMeasureFields';
import { colors, metricColors } from '@/constants/colors';
import { INTENSITY_LABEL, CATEGORY_LABEL } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsDate,
} from '@/services/workouts.service';
import { useProfile } from '@/services/users.service';
import type { WorkoutCategory, WorkoutIntensity, WorkoutLibraryItem } from '@/types';
import { dayPhrase, todayWIB } from '@/utils/date';
import { duration, thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

const KATEGORI = ['CARDIO', 'STRENGTH', 'FLEXIBILITY', 'SPORTS', 'OTHER'] as const;
const INTENSITAS = ['LOW', 'MEDIUM', 'HIGH'] as const;

/** Berat acuan nilai kkal/menit di library. Sama dengan BERAT_ACUAN_KG di backend. */
const BERAT_ACUAN_KG = 70;

export const WorkoutPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());
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

  // Taksiran dari MENIT GERAK, cermin perhitungan backend: untuk repetisi
  // itu ulangan x detik per ulangan, jeda antar set tidak dihitung.
  const taksiran = dipilih
    ? Math.round(
        ((toNum(dipilih.calories_burned_per_minute) ?? 0) *
          menitGerak(dipilih.measure, ukuran, dipilih.seconds_per_rep) *
          beratKg) /
          BERAT_ACUAN_KG,
      )
    : null;

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

    create.mutate(
      {
        workout_library_id: dipilih.id,
        ...ukuranKeBody(dipilih.measure, ukuran),
        intensity: intensitas,
        tracked_by_device: terekam,
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
        },
      },
    );
  };

  return (
    <>
      <SectionHeader title="Catat olahraga" />

      <DateField value={tanggal} onChange={setTanggal} />

      <Card>
        <div className="stack">
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
              <WorkoutMeasureFields
                measure={dipilih.measure}
                value={ukuran}
                onChange={setUkuran}
                nama={dipilih.name}
              />

              <div className="stack-xs">
                <span className="t-label c-secondary">Intensitas</span>
                <ChipGroup
                  options={INTENSITAS}
                  value={intensitas}
                  onChange={setIntensitas}
                  labels={INTENSITY_LABEL}
                />
              </div>

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
                      ? 'Taksiran dari durasi dan berat badanmu. Ketik sendiri kalau jam tanganmu menunjukkan angka lain.'
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
