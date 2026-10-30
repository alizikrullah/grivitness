import { ChipGroup, ErrorNote } from '@/components/ui';
import { DAY_STATUS_LABEL, DAY_STATUS_OPTIONS } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import { useSetWorkoutDayStatus } from '@/services/workouts.service';
import type { SickMark, WorkoutDayStatus } from '@/types';
import { shortDate } from '@/utils/date';

interface DayStatusPickerProps {
  date: string;
  value: WorkoutDayStatus | null;
  /** Rentang sakit yang memuat tanggal ini, untuk menyebut sejak kapan. */
  sick: SickMark | null;
}

/**
 * Padanan DayStatusPicker mobile: hari biasa, rest day, atau lagi sakit.
 *
 * Di web pilihannya chip yang langsung terlihat, sama seperti pilihan
 * olahraga di panel ini; mobile memakai baris yang membuka Sheet. Cuma tanda
 * untuk chat dan overview, tidak ada hitungan yang berubah.
 */
export const DayStatusPicker = ({ date, value, sick }: DayStatusPickerProps) => {
  const ubah = useSetWorkoutDayStatus();

  // Selama permintaan berjalan, tampilkan yang baru dipilih, bukan yang lama.
  const aktif: WorkoutDayStatus | '' = (ubah.isPending ? ubah.variables.status : value) ?? '';

  return (
    <div className="stack-xs">
      <span className="t-overline c-tertiary">Status hari</span>
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
