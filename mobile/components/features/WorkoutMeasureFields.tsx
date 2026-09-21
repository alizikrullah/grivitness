import { StyleSheet, View } from 'react-native';

import { Input, Stepper, Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import type { WorkoutLog, WorkoutMeasure } from '@/types';
import { duration, toNum } from '@/utils/format';

/**
 * Isian ukuran satu sesi olahraga, mengikuti cara olahraganya diukur.
 *
 *   TIME  menit
 *   REPS  set x ulangan, beban kg opsional
 *   HOLD  set x detik tahan
 *
 * "Push up 5 kali" tidak bisa ditulis sebagai menit, jadi untuk REPS dan HOLD
 * form TIDAK pernah menanyakan menit. Menit geraknya diturunkan backend dari
 * ulangan x detik per ulangan; di sini cuma dihitung ulang untuk taksiran
 * kalori yang tampil sebelum disimpan.
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

/** Cara ukur sebuah log yang sudah tersimpan, dibaca dari kolom yang terisi. */
export const measureDariLog = (log: WorkoutLog): WorkoutMeasure =>
  log.reps !== null ? 'REPS' : log.hold_seconds !== null ? 'HOLD' : 'TIME';

/** Nilai awal isian dari log yang sedang dikoreksi. */
export const ukuranDariLog = (log: WorkoutLog): UkuranSesi => ({
  menit: Math.max(1, log.duration_minutes),
  set: log.sets ?? 1,
  ulangan: log.reps ?? UKURAN_BAWAAN.ulangan,
  detik: log.hold_seconds ?? UKURAN_BAWAAN.detik,
  beban: log.load_kg === null ? '' : String(toNum(log.load_kg) ?? ''),
});

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
}

export const WorkoutMeasureFields = ({ measure, value, onChange }: WorkoutMeasureFieldsProps) => {
  const ubah = (sebagian: Partial<UkuranSesi>) => onChange({ ...value, ...sebagian });

  if (measure === 'REPS') {
    return (
      <View style={styles.group}>
        <View style={styles.dua}>
          <View style={styles.kolom}>
            <Text variant="overline" tone="tertiary" align="center">
              Set
            </Text>
            <Stepper value={value.set} onChange={(set) => ubah({ set })} min={1} max={100} />
          </View>
          <View style={styles.kolom}>
            <Text variant="overline" tone="tertiary" align="center">
              Ulangan per set
            </Text>
            <Stepper
              value={value.ulangan}
              onChange={(ulangan) => ubah({ ulangan })}
              min={1}
              max={1000}
            />
          </View>
        </View>
        <Input
          label="Beban"
          value={value.beban}
          onChangeText={(beban) => ubah({ beban })}
          placeholder="Berat badan sendiri"
          keyboardType="decimal-pad"
          suffix="kg"
          hint="Opsional. Catatan progres, tidak mengubah kalori."
        />
      </View>
    );
  }

  if (measure === 'HOLD') {
    return (
      <View style={styles.dua}>
        <View style={styles.kolom}>
          <Text variant="overline" tone="tertiary" align="center">
            Set
          </Text>
          <Stepper value={value.set} onChange={(set) => ubah({ set })} min={1} max={100} />
        </View>
        <View style={styles.kolom}>
          <Text variant="overline" tone="tertiary" align="center">
            Detik per set
          </Text>
          <Stepper
            value={value.detik}
            onChange={(detik) => ubah({ detik })}
            step={5}
            min={5}
            max={3600}
            suffix="dtk"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.group}>
      <Text variant="overline" tone="tertiary" align="center">
        Durasi
      </Text>
      <Stepper
        value={value.menit}
        onChange={(menit) => ubah({ menit })}
        step={5}
        min={1}
        max={1440}
        suffix="menit"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  group: { gap: spacing.lg },
  dua: { flexDirection: 'row', gap: spacing.md },
  kolom: { flex: 1, gap: spacing.md },
});
