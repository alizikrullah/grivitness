import { useState } from 'react';

import { Button, Checkbox, ErrorNote, Input, Sheet } from '@/components/ui';
import { toApiError } from '@/lib/api';
import { useUpdateWorkout } from '@/services/workouts.service';
import type { WorkoutLog } from '@/types';
import {
  WorkoutMeasureFields,
  measureDariLog,
  ukuranDariLog,
  ukuranKeBody,
} from './WorkoutMeasureFields';

interface WorkoutEditSheetProps {
  log: WorkoutLog;
  onClose: () => void;
}

/**
 * Mengoreksi sesi olahraga.
 *
 * Kalori ikut bisa disunting, sama seperti di form pencatatan. Yang perlu
 * dijaga adalah ASALNYA: kalau user mengetik angkanya, itu dikirim dan backend
 * menandainya MANUAL. Kalau dibiarkan, tidak dikirim, dan backend memutuskan
 * sendiri: taksiran MET diskalakan mengikuti durasi baru, angka manual
 * dibiarkan apa adanya.
 */
export const WorkoutEditSheet = ({ log, onClose }: WorkoutEditSheetProps) => {
  const update = useUpdateWorkout();

  // Cara ukurnya dibaca dari kolom yang terisi di log: sesi push up dikoreksi
  // sebagai set x ulangan, bukan dipaksa jadi menit.
  const measure = measureDariLog(log);
  const [ukuran, setUkuran] = useState(ukuranDariLog(log));
  const [catatan, setCatatan] = useState(log.notes ?? '');
  const [terekam, setTerekam] = useState(log.tracked_by_device);
  const [error, setError] = useState<string | null>(null);

  /** Null selama user belum menyentuh kolomnya. Lihat catatan di atas. */
  const [kaloriDiketik, setKaloriDiketik] = useState<string | null>(null);

  const manual = log.calories_source === 'MANUAL';

  const simpan = () => {
    let kalori: number | undefined;

    if (kaloriDiketik !== null) {
      const angka = Number(kaloriDiketik);

      if (kaloriDiketik.trim() === '' || !Number.isFinite(angka) || angka < 0) {
        setError('Isi kalori terbakar');
        return;
      }

      kalori = Math.round(angka);
    }

    setError(null);

    update.mutate(
      {
        id: log.id,
        ...ukuranKeBody(measure, ukuran),
        // Beban yang dikosongkan berarti dihapus, bukan dibiarkan.
        ...(measure === 'REPS' && ukuran.beban.trim() === '' ? { load_kg: null } : {}),
        notes: catatan.trim() === '' ? null : catatan.trim(),
        tracked_by_device: terekam,
        ...(kalori === undefined ? {} : { calories_burned: kalori }),
      },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={log.workout_name}
      footer={
        <Button label="Simpan perubahan" onPress={simpan} loading={update.isPending} size="lg" />
      }
    >
      <WorkoutMeasureFields measure={measure} value={ukuran} onChange={setUkuran} />

      <Input
        label="Kalori terbakar"
        value={kaloriDiketik ?? String(log.calories_burned)}
        onChangeText={setKaloriDiketik}
        keyboardType="number-pad"
        suffix="kkal"
        hint={
          kaloriDiketik !== null
            ? 'Angka ini disimpan apa adanya dan tidak dihitung ulang.'
            : manual
              ? 'Angka yang kamu isi sendiri. Tidak ikut berubah kalau durasinya diubah.'
              : 'Taksiran. Ikut menyesuaikan kalau ukurannya diubah, kecuali kamu ketik sendiri.'
        }
      />

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
        maxLength={1000}
        autoCapitalize="sentences"
        multiline
      />

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};
