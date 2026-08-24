import { RulerIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button, Card, EmptyState, ErrorNote, Input, Loading, SectionHeader } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import {
  MEASUREMENT_PARTS,
  type MeasurementKey,
  useDeleteMeasurement,
  useLatestMeasurement,
  useSaveMeasurement,
} from '@/services/measurements.service';
import { shortDate } from '@/utils/date';
import { toNum } from '@/utils/format';
import { LogActions } from './LogActions';

export const MeasurementsPanel = () => {
  const latest = useLatestMeasurement();
  const save = useSaveMeasurement();
  const hapus = useDeleteMeasurement();

  const [nilai, setNilai] = useState<Partial<Record<MeasurementKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const ubah = (key: MeasurementKey, teks: string) =>
    setNilai((lama) => ({ ...lama, [key]: teks.replace(',', '.').replace(/[^0-9.]/g, '') }));

  /** Nilai yang tampil: yang sedang diketik, kalau tidak ada baru yang tersimpan. */
  const tampil = (key: MeasurementKey): string =>
    nilai[key] ?? (latest.data ? (toNum(latest.data[key])?.toString() ?? '') : '');

  const simpan = () => {
    setError(null);
    setPesan(null);

    const body: Record<string, number> = {};

    for (const { key } of MEASUREMENT_PARTS) {
      const angka = Number(tampil(key));
      // Kolom yang dikosongkan sengaja TIDAK dikirim. Mengirimnya sebagai 0
      // akan tercatat sebagai "pinggang nol sentimeter", bukan "belum diukur".
      if (tampil(key).trim() !== '' && Number.isFinite(angka) && angka > 0) body[key] = angka;
    }

    if (Object.keys(body).length === 0) {
      setError('Isi minimal satu ukuran');
      return;
    }

    save.mutate(body, {
      onError: (e) => setError(toApiError(e).message),
      onSuccess: () => {
        setPesan('Ukuran badan tersimpan');
        setNilai({});
      },
    });
  };

  return (
    <>
      <SectionHeader title="Ukuran badan" />

      <Card>
        <div className="stack">
          <div className="grid-2">
            {MEASUREMENT_PARTS.map(({ key, label }) => (
              <Input
                key={key}
                label={label}
                inputMode="decimal"
                value={tampil(key)}
                onChange={(e) => ubah(key, e.target.value)}
                placeholder="-"
                suffix="cm"
              />
            ))}
          </div>

          {error ? <ErrorNote message={error} /> : null}
          {pesan ? <span className="t-caption c-success">{pesan}</span> : null}

          <Button label="Simpan" size="lg" full onClick={simpan} loading={save.isPending} />
        </div>
      </Card>

      <SectionHeader title="Terakhir tercatat" />

      {latest.isPending ? (
        <Loading />
      ) : !latest.data ? (
        <EmptyState
          icon={<RulerIcon size={28} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada ukuran badan"
          message="Ukuran pinggang sering turun lebih dulu daripada angka timbangan."
        />
      ) : (
        <Card padding="md">
          <div>
            <div className="row-between" style={{ paddingBottom: 'var(--space-md)' }}>
              <span className="t-caption c-secondary">{shortDate(latest.data.logged_at)}</span>
              <LogActions
                onDelete={() =>
                  hapus.mutate(latest.data?.id ?? '', {
                    onError: (e) => setError(toApiError(e).message),
                  })
                }
                confirmMessage="Hapus catatan ukuran badan ini?"
              />
            </div>

            {MEASUREMENT_PARTS.filter(({ key }) => toNum(latest.data?.[key]) !== null).map(
              ({ key, label }) => (
                <div key={key} className="log-row">
                  <span className="log-row-icon">
                    <RulerIcon size={16} color={metricColors.measurements} weight="fill" />
                  </span>
                  <span className="flex-1 t-body-medium">{label}</span>
                  <span className="t-label">{toNum(latest.data?.[key])} cm</span>
                </div>
              ),
            )}
          </div>
        </Card>
      )}
    </>
  );
};
