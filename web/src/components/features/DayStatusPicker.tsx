import { ChipGroup, ErrorNote } from '@/components/ui';
import { DAY_STATUS_LABEL, DAY_STATUS_OPTIONS } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import { useSetWorkoutDayStatus } from '@/services/workouts.service';
import type { SickMark, WorkoutDayStatus } from '@/types';
import { shortDate } from '@/utils/date';

interface DayStatusPickerProps {
  date: string;
  /** Rentang sakit yang memuat tanggal ini (DailySummary.sick), untuk menyebut sejak kapan. */
  sick: SickMark | null;
  /** Tanggal ini ditandai rest day (DailySummary.rest). */
  rest: boolean;
}

/**
 * Padanan DayStatusPicker mobile: kondisi tubuh di panel Mood, normal, rest
 * day, atau lagi sakit.
 *
 * Di web pilihannya chip yang langsung terlihat; mobile memakai baris yang
 * membuka Sheet. Cuma tanda untuk chat dan overview, tidak ada hitungan yang
 * berubah.
 */
export const DayStatusPicker = ({ date, sick, rest }: DayStatusPickerProps) => {
  const ubah = useSetWorkoutDayStatus();

  // Sakit menang kalau dua-duanya ada, sama dengan bacaStatusHari() di backend.
  const tersimpan: WorkoutDayStatus | '' = sick ? 'SICK' : rest ? 'REST' : '';
  // Selama permintaan berjalan, tampilkan yang baru dipilih, bukan yang lama.
  const aktif: WorkoutDayStatus | '' = ubah.isPending ? (ubah.variables.status ?? '') : tersimpan;

  return (
    <div className="stack-xs">
      <span className="t-overline c-tertiary">Kondisi tubuh</span>
      <ChipGroup
        options={DAY_STATUS_OPTIONS}
        value={aktif}
        onChange={(p) => {
          if (p !== aktif) ubah.mutate({ date, status: p === '' ? null : p });
        }}
        labels={DAY_STATUS_LABEL}
      />

      {/* Cuma saat sakit: user perlu tahu sejak kapan dan cara mengakhirinya. */}
      {aktif === 'SICK' && sick ? (
        <span className="t-caption c-secondary">
          {sick.end_date
            ? 'Sakit ' + shortDate(sick.start_date) + ' sampai ' + shortDate(sick.end_date) + '.'
            : 'Sakit sejak ' +
              shortDate(sick.start_date) +
              '. Pilih status lain di hari kamu sembuh.'}
        </span>
      ) : null}

      {ubah.isError ? <ErrorNote message={toApiError(ubah.error).message} /> : null}
    </div>
  );
};
