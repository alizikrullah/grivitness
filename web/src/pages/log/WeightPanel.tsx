import { ScalesIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { TrendChart } from '@/components/features/Charts';
import {
  Button,
  Card,
  DateField,
  EmptyState,
  ErrorNote,
  Loading,
  SectionHeader,
  Stepper,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import {
  useCreateWeight,
  useUpdateWeight,
  useWeightDate,
  useWeightRange,
} from '@/services/weight.service';
import { dateRange, dayPhrase, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { kg, toNum } from '@/utils/format';

export const WeightPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());

  // Chart tetap berlabuh pada hari ini apa pun tanggal yang dibuka, supaya
  // bentuk trennya tidak ikut bergeser setiap kali user menoleh ke belakang.
  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -29);

  const today = useWeightDate(tanggal);
  const riwayat = useWeightRange(awal, hariIni);
  const create = useCreateWeight();
  const update = useUpdateWeight();

  const [nilai, setNilai] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /**
   * Angka yang sedang diketik dilepas saat pindah tanggal, disesuaikan saat
   * render dan bukan lewat useEffect. Tanpa ini, berat yang tampil untuk
   * tanggal lampau adalah angka hari ini yang barusan dilihat.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(tanggal);
  if (tanggal !== tanggalTerakhir) {
    setTanggalTerakhir(tanggal);
    setNilai(null);
    setError(null);
    setPesan(null);
  }

  const berat = nilai ?? toNum(today.data?.weight_kg) ?? 70;

  const simpan = () => {
    setError(null);
    setPesan(null);

    const onError = (e: unknown) => setError(toApiError(e).message);
    const onSuccess = () => setPesan('Berat badan tersimpan');

    // Satu baris per user per hari dijamin unique constraint di database, jadi
    // menyimpan dua kali di hari yang sama harus jadi UPDATE, bukan INSERT, // kalau tidak, backend membalas DUPLICATE_ENTRY.
    if (today.data) {
      update.mutate({ id: today.data.id, weight_kg: berat }, { onError, onSuccess });
    } else {
      // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
      create.mutate({ weight_kg: berat, logged_at: tanggal }, { onError, onSuccess });
    }
  };

  const titik = dateRange(awal, hariIni).map((hari) => ({
    label: shortDate(hari),
    value: toNum(riwayat.data?.find((l) => l.logged_at === hari)?.weight_kg),
  }));

  const adaData = (riwayat.data?.length ?? 0) > 0;

  return (
    <>
      <SectionHeader title={'Berat badan ' + dayPhrase(tanggal)} />

      <DateField value={tanggal} onChange={setTanggal} />

      <Card>
        <div className="stack">
          <Stepper
            value={berat}
            onChange={setNilai}
            step={0.1}
            min={20}
            max={400}
            decimals={1}
            suffix="kg"
            label="Berat"
          />

          {error ? <ErrorNote message={error} /> : null}
          {pesan ? <span className="t-caption c-success">{pesan}</span> : null}

          <Button
            label={today.data ? 'Perbarui' : 'Simpan'}
            size="lg"
            full
            onClick={simpan}
            loading={create.isPending || update.isPending}
          />
        </div>
      </Card>

      <SectionHeader title="Tren 30 hari" />

      <Card>
        {riwayat.isPending ? (
          <Loading />
        ) : adaData ? (
          <TrendChart data={titik} color={metricColors.weight} unit=" kg" />
        ) : (
          <EmptyState
            icon={<ScalesIcon size={28} color={colors.textTertiary} weight="duotone" />}
            title="Belum ada catatan berat"
            message="Simpan berat pertamamu untuk mulai melihat trennya."
          />
        )}
      </Card>

      {adaData ? (
        <>
          <SectionHeader title="Riwayat" />
          <Card padding="md">
            <div>
              {[...(riwayat.data ?? [])]
                .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
                .map((log) => (
                  <div key={log.id} className="log-row">
                    <span className="log-row-icon">
                      <ScalesIcon size={16} color={metricColors.weight} weight="fill" />
                    </span>

                    <span className="flex-1">
                      <span className="t-body-medium">{kg(log.weight_kg)} kg</span>
                      <span className="t-caption c-tertiary"> · {shortDate(log.logged_at)}</span>
                    </span>

                    {/*
                      Sengaja tanpa tombol ubah maupun hapus. Berat dijamin satu
                      baris per hari oleh unique constraint, dan backend memang
                      tidak menyediakan DELETE untuknya, koreksinya dilakukan
                      dengan menyimpan ulang di hari yang sama. Menampilkan
                      tombol yang pasti gagal cuma menjanjikan sesuatu yang tidak
                      ada.
                    */}
                  </div>
                ))}
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
};
