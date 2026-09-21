import { Input, Stepper } from '@/components/ui';
import type { WorkoutLog, WorkoutMeasure } from '@/types';
import { duration, toNum } from '@/utils/format';

/**
 * Isian ukuran satu sesi olahraga, mengikuti cara olahraganya diukur.
 * Padanan komponen mobile; alasan desainnya ada di sana. Untuk REPS dan HOLD
 * form tidak pernah menanyakan menit; menit gerak diturunkan backend.
 */
export interface UkuranSesi {
  menit: number;
  set: number;
  ulangan: number;
  detik: number;
  /** Teks apa adanya dari kolom; kosong berarti berat badan sendiri. */
  beban: string;
}

export const UKURAN_BAWAAN: UkuranSesi = { menit: 30, set: 3, ulangan: 10, detik: 30, beban: '' };

/** Detik per ulangan kalau library tidak menyebut. Sama dengan backend. */
const DETIK_PER_ULANGAN_BAWAAN = 3;

/** Menit gerak untuk taksiran kalori di layar. Cermin dari perhitungan backend. */
export const menitGerak = (
  measure: WorkoutMeasure,
  u: UkuranSesi,
  detikPerUlangan: number | null,
): number => {
  if (measure === 'REPS')
    return (u.set * u.ulangan * (detikPerUlangan ?? DETIK_PER_ULANGAN_BAWAAN)) / 60;
  if (measure === 'HOLD') return (u.set * u.detik) / 60;
  return u.menit;
};

/** Bagian body permintaan yang menyatakan ukurannya. */
export const ukuranKeBody = (
  measure: WorkoutMeasure,
  u: UkuranSesi,
): {
  duration_minutes?: number;
  sets?: number;
  reps?: number;
  hold_seconds?: number;
  load_kg?: number;
} => {
  if (measure === 'REPS') {
    const beban = Number(u.beban);
    return {
      sets: u.set,
      reps: u.ulangan,
      ...(u.beban.trim() !== '' && Number.isFinite(beban) && beban > 0 ? { load_kg: beban } : {}),
    };
  }
  if (measure === 'HOLD') return { sets: u.set, hold_seconds: u.detik };
  return { duration_minutes: u.menit };
};

/** "3 x 12", "3 x 12 @ 40 kg", "3 x 45 dtk", atau "30m". Bukan "0 menit". */
export const ringkasSesi = (log: WorkoutLog): string => {
  if (log.reps !== null) {
    const beban = toNum(log.load_kg);
    return `${log.sets ?? 1} x ${log.reps}${beban ? ` @ ${beban} kg` : ''}`;
  }
  if (log.hold_seconds !== null) return `${log.sets ?? 1} x ${log.hold_seconds} dtk`;
  return duration(log.duration_minutes);
};

interface WorkoutMeasureFieldsProps {
  measure: WorkoutMeasure;
  value: UkuranSesi;
  onChange: (value: UkuranSesi) => void;
  /** Nama olahraga, ditempel di label durasi. */
  nama: string;
}

export const WorkoutMeasureFields = ({
  measure,
  value,
  onChange,
  nama,
}: WorkoutMeasureFieldsProps) => {
  const ubah = (sebagian: Partial<UkuranSesi>) => onChange({ ...value, ...sebagian });

  if (measure === 'REPS') {
    return (
      <div className="stack-sm">
        <div className="grid-2">
          <Stepper
            value={value.set}
            onChange={(set) => ubah({ set })}
            min={1}
            max={100}
            label="Set"
          />
          <Stepper
            value={value.ulangan}
            onChange={(ulangan) => ubah({ ulangan })}
            min={1}
            max={1000}
            label="Ulangan per set"
          />
        </div>
        <Input
          label="Beban"
          inputMode="decimal"
          value={value.beban}
          onChange={(e) =>
            ubah({ beban: e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') })
          }
          placeholder="Berat badan sendiri"
          suffix="kg"
          hint="Opsional. Catatan progres, tidak mengubah kalori."
        />
      </div>
    );
  }

  if (measure === 'HOLD') {
    return (
      <div className="grid-2">
        <Stepper
          value={value.set}
          onChange={(set) => ubah({ set })}
          min={1}
          max={100}
          label="Set"
        />
        <Stepper
          value={value.detik}
          onChange={(detik) => ubah({ detik })}
          step={5}
          min={5}
          max={3600}
          suffix="dtk"
          label="Detik per set"
        />
      </div>
    );
  }

  return (
    <Stepper
      value={value.menit}
      onChange={(menit) => ubah({ menit })}
      step={5}
      min={1}
      max={600}
      suffix="menit"
      label={'Durasi ' + nama}
    />
  );
};
