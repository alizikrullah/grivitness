import { BarbellIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  Button,
  Card,
  ChipGroup,
  DateField,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  SectionHeader,
  Stepper,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { INTENSITY_LABEL, CATEGORY_LABEL } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsDate,
} from '@/services/workouts.service';
import { useDeviceEnergyDate } from '@/services/device-energy.service';
import type { WorkoutCategory, WorkoutIntensity, WorkoutLibraryItem } from '@/types';
import { dayPhrase, todayWIB } from '@/utils/date';
import { duration, thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

const KATEGORI = ['CARDIO', 'STRENGTH', 'FLEXIBILITY', 'SPORTS', 'OTHER'] as const;
const INTENSITAS = ['LOW', 'MEDIUM', 'HIGH'] as const;

/** Pilihan pada pertanyaan "terekam smartwatch". */
const REKAM = ['YA', 'TIDAK'] as const;
const REKAM_LABEL = { YA: 'Ya, jam saya pakai', TIDAK: 'Tidak' };

export const WorkoutPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());
  const hariIni = tanggal === todayWIB();

  const today = useWorkoutsDate(tanggal);
  const create = useCreateWorkout();
  const hapus = useDeleteWorkout();

  /**
   * Pertanyaan "terekam smartwatch" hanya relevan kalau hari itu memang ada
   * angka dari perangkat. Tanpa itu kalori olahraga selalu dihitung penuh, dan
   * menanyakannya cuma menambah satu keputusan yang tidak berpengaruh apa-apa.
   */
  const angkaPerangkat = useDeviceEnergyDate(tanggal).data;

  const [kategori, setKategori] = useState<WorkoutCategory>('CARDIO');
  const [cari, setCari] = useState('');
  const library = useWorkoutLibrary(kategori, cari.trim() || undefined);

  const [dipilih, setDipilih] = useState<WorkoutLibraryItem | null>(null);
  const [menit, setMenit] = useState(30);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>('MEDIUM');
  const [terekam, setTerekam] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    if (!dipilih) {
      setError('Pilih jenis olahraga dulu');
      return;
    }

    create.mutate(
      {
        workout_library_id: dipilih.id,
        duration_minutes: menit,
        intensity: intensitas,
        // Kalau hari itu tidak ada angka perangkat, pertanyaannya tidak muncul
        // di layar, jadi tidak boleh ada nilai yang menyelinap dari sesi lalu.
        tracked_by_device: angkaPerangkat ? terekam : false,
        // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
        logged_at: hariIni ? undefined : tanggal,
      },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          setDipilih(null);
          setTerekam(false);
        },
      },
    );
  };

  /**
   * Perkiraan kalori ditampilkan SEBELUM disimpan, dihitung dari nilai per
   * menit di library. Backend tetap menghitung ulang dengan berat badan
   * sebenarnya, yang di sini cuma ancar-ancar supaya user tahu kira-kira
   * dampaknya sebelum memutuskan.
   */
  const perkiraan = dipilih
    ? Math.round((toNum(dipilih.calories_burned_per_minute) ?? 0) * menit)
    : 0;

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
              <Stepper
                value={menit}
                onChange={setMenit}
                step={5}
                min={1}
                max={600}
                suffix="menit"
                label={'Durasi ' + dipilih.name}
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

              <div className="row-between">
                <span className="t-caption c-secondary">Perkiraan kalori</span>
                <span className="t-h3 c-accent">{thousands(perkiraan)} kkal</span>
              </div>

              {/*
                Muncul HANYA kalau hari itu ada angka kalori dari smartwatch.

                Jawabannya menentukan apakah kalori sesi ini ditambahkan di atas
                angka perangkat. Jalan santai dan berkebun sambil memakai jam
                sudah ikut terhitung di sana, jadi menambahkannya lagi berarti
                menghitung dua kali. Berenang atau sesi yang jamnya dilepas
                belum, jadi memang harus ditambahkan.
              */}
              {angkaPerangkat ? (
                <div className="stack-xs">
                  <span className="t-label c-secondary">Sesi ini terekam smartwatch?</span>
                  <ChipGroup
                    options={REKAM}
                    value={terekam ? 'YA' : 'TIDAK'}
                    onChange={(v) => setTerekam(v === 'YA')}
                    labels={REKAM_LABEL}
                  />
                  <span className="t-caption c-tertiary">
                    {'Kalau jawabannya ya, kalorinya sudah termasuk di angka ' +
                      thousands(angkaPerangkat.total_kcal) +
                      ' kkal dan tidak dihitung lagi.'}
                  </span>
                </div>
              ) : null}
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
                    · {duration(log.duration_minutes)} · {thousands(log.calories_burned)} kkal
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
