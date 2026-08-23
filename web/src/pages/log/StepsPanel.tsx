import { FootprintsIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { HighlightBarChart } from '@/components/features/Charts';
import { Button, Card, ErrorNote, Loading, ProgressBar, SectionHeader, Stepper } from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useDailySummary } from '@/services/misc.service';
import { useDeleteSteps, useSaveSteps, useStepsRange, useStepsToday } from '@/services/steps.service';
import { dateRange, dayLabel, shiftDays, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';
import { LogActions } from './LogActions';

export const StepsPanel = () => {
  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -6);

  const today = useStepsToday();
  const riwayat = useStepsRange(awal, hariIni);
  const save = useSaveSteps();
  const hapus = useDeleteSteps();

  /**
   * Target langkah datang dari backend, diturunkan dari usia dan target berat.
   * Query-nya sudah terisi dari beranda, jadi tidak menambah permintaan jaringan.
   */
  const target = useDailySummary(hariIni).data?.targets.steps;

  const [nilai, setNilai] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const langkah = nilai ?? today.data?.steps ?? 0;

  const simpan = () => {
    setError(null);
    setPesan(null);

    save.mutate(
      { steps: langkah },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => setPesan('Langkah tersimpan'),
      },
    );
  };

  const batang = dateRange(awal, hariIni).map((tanggal) => ({
    label: dayLabel(tanggal),
    value: riwayat.data?.find((l) => l.logged_at === tanggal)?.steps ?? 0,
  }));

  return (
    <>
      <SectionHeader title="Langkah hari ini" />

      <Card>
        <div className="stack">
          <Stepper
            value={langkah}
            onChange={setNilai}
            step={500}
            min={0}
            max={200_000}
            suffix="langkah"
            label="Jumlah langkah"
          />

          <div className="stack-xs">
            <div className="row-between">
              <span className="t-caption c-secondary">Target harian</span>
              <span className="t-label">
                {thousands(langkah)}
                <span className="c-tertiary"> / {thousands(target?.steps ?? 0)}</span>
              </span>
            </div>
            <ProgressBar
              progress={target?.steps ? langkah / target.steps : 0}
              color={metricColors.steps}
            />

            {/*
              Dua lapis, dan pemisahannya disengaja. Lapis pertama murni
              kesehatan — Paluch dkk. 2022 menunjukkan manfaatnya mendatar
              sekitar 8.000, bukan 10.000. Lapis kedua muncul cuma kalau target
              beratmu tidak bisa dikejar dari makanan saja tanpa menembus batas
              aman, jadi angkanya bisa dijelaskan.
            */}
            {target && target.for_goal > 0 ? (
              <span className="t-caption c-tertiary">
                {thousands(target.baseline)} untuk kesehatan, {thousands(target.for_goal)} sisanya
                untuk mengejar target beratmu.
              </span>
            ) : null}
          </div>

          {error ? <ErrorNote message={error} /> : null}
          {pesan ? <span className="t-caption c-success">{pesan}</span> : null}

          <Button label="Simpan" size="lg" full onClick={simpan} loading={save.isPending} />
        </div>
      </Card>

      <SectionHeader title="Tujuh hari terakhir" />

      <Card>{riwayat.isPending ? <Loading /> : <HighlightBarChart data={batang} color={metricColors.steps} />}</Card>

      {today.data ? (
        <Card padding="md">
          <div className="log-row">
            <span className="log-row-icon">
              <FootprintsIcon size={16} color={metricColors.steps} weight="fill" />
            </span>

            <span className="flex-1">
              <span className="t-body-medium">{thousands(today.data.steps)} langkah</span>
              <span className="t-caption c-tertiary">
                {' '}
                · {today.data.distance_km} km · {today.data.calories_burned} kkal
              </span>
            </span>

            <LogActions
              onDelete={() =>
                hapus.mutate(today.data?.id ?? '', {
                  onError: (e) => setError(toApiError(e).message),
                })
              }
              confirmMessage="Hapus catatan langkah hari ini?"
            />
          </div>
        </Card>
      ) : null}
    </>
  );
};
