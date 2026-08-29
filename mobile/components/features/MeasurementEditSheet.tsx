import { useState } from 'react';

import { Button, ErrorNote, Input, Sheet } from '@/components/ui';
import { toApiError } from '@/lib/api';
import {
  MEASUREMENT_PARTS,
  useSaveMeasurement,
  type MeasurementInput,
  type MeasurementKey,
} from '@/services/measurements.service';
import type { BodyMeasurement } from '@/types';
import { longDate } from '@/utils/date';
import { toNum } from '@/utils/format';

interface MeasurementEditSheetProps {
  log: BodyMeasurement;
  onClose: () => void;
}

/**
 * Mengoreksi satu pengukuran yang sudah tercatat.
 *
 * Bagian yang dikosongkan diperlakukan sebagai "tidak diukur", bukan nol, lingkar badan
 * nol tidak berarti apa-apa, dan backend memang mengizinkan
 * kolomnya kosong.
 */
export const MeasurementEditSheet = ({ log, onClose }: MeasurementEditSheetProps) => {
  const save = useSaveMeasurement();

  const [nilai, setNilai] = useState<Record<string, string>>(() => {
    const awal: Record<string, string> = {};
    for (const bagian of MEASUREMENT_PARTS) {
      const angka = toNum(log[bagian.key]);
      awal[bagian.key] = angka === null ? '' : String(angka);
    }
    return awal;
  });

  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    const body: MeasurementInput = {};
    let adaIsi = false;

    for (const bagian of MEASUREMENT_PARTS) {
      const teks = nilai[bagian.key]?.trim();
      if (!teks) continue;

      const angka = Number(teks.replace(',', '.'));

      if (!Number.isFinite(angka) || angka < 10 || angka > 300) {
        setError(bagian.label + ' harus antara 10 sampai 300 cm');
        return;
      }

      body[bagian.key] = angka;
      adaIsi = true;
    }

    if (!adaIsi) {
      setError('Isi minimal satu ukuran badan');
      return;
    }

    save.mutate(
      { id: log.id, ...body },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={longDate(log.logged_at)}
      footer={
        <Button label="Simpan perubahan" onPress={simpan} loading={save.isPending} size="lg" />
      }
    >
      {MEASUREMENT_PARTS.map((bagian) => (
        <Input
          key={bagian.key}
          label={bagian.label}
          value={nilai[bagian.key] ?? ''}
          onChangeText={(teks) =>
            setNilai((sebelum) => ({ ...sebelum, [bagian.key as MeasurementKey]: teks }))
          }
          placeholder="Kosongkan kalau tidak diukur"
          keyboardType="decimal-pad"
          suffix="cm"
        />
      ))}

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};
