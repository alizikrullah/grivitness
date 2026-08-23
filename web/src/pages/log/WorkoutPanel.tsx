import { BarbellIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button, Card, ChipGroup, EmptyState, ErrorNote, Input, Loading, SectionHeader, Stepper } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { INTENSITY_LABEL, CATEGORY_LABEL } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsToday,
} from '@/services/workouts.service';
import type { WorkoutCategory, WorkoutIntensity, WorkoutLibraryItem } from '@/types';
import { duration, thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

const KATEGORI = ['CARDIO', 'STRENGTH', 'FLEXIBILITY', 'SPORTS', 'OTHER'] as const;
const INTENSITAS = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const WorkoutPanel = () => {
  const today = useWorkoutsToday();
  const create = useCreateWorkout();
  const hapus = useDeleteWorkout();

  const [kategori, setKategori] = useState<WorkoutCategory>('CARDIO');
  const [cari, setCari] = useState('');
  const library = useWorkoutLibrary(kategori, cari.trim() || undefined);

  const [dipilih, setDipilih] = useState<WorkoutLibraryItem | null>(null);
  const [menit, setMenit] = useState(30);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>('MEDIUM');
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
      },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => setDipilih(null),
      },
    );
  };

  /**
   * Perkiraan kalori ditampilkan SEBELUM disimpan, dihitung dari nilai per
   * menit di library. Backend tetap menghitung ulang dengan berat badan
   * sebenarnya — yang di sini cuma ancar-ancar supaya user tahu kira-kira
   * dampaknya sebelum memutuskan.
   */
  const perkiraan = dipilih ? Math.round((toNum(dipilih.calories_burned_per_minute) ?? 0) * menit) : 0;

  return (
    <>
      <SectionHeader title="Catat olahraga" />

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

      <SectionHeader title="Olahraga hari ini" />

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
