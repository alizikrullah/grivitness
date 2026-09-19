import { FootprintsIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { HighlightBarChart } from '@/components/features/Charts';
import {
  Button,
  Card,
  DateField,
  ErrorNote,
  Loading,
  Modal,
  ProgressBar,
  SectionHeader,
  Stepper,
} from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useDailySummary } from '@/services/misc.service';
import { useSaveProfile } from '@/services/users.service';
import {
  useDeleteSteps,
  useSaveSteps,
  useStepsDate,
  useStepsRange,
} from '@/services/steps.service';
import { dateRange, dayLabel, dayPhrase, shiftDays, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';
import { LogActions } from './LogActions';

export const StepsPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());
  const [ubahTarget, setUbahTarget] = useState(false);

  // Chart tetap berlabuh pada hari ini apa pun tanggal yang sedang dibuka.
  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -6);

  const today = useStepsDate(tanggal);
  const riwayat = useStepsRange(awal, hariIni);
  const save = useSaveSteps();
  const hapus = useDeleteSteps();

  /**
   * Target langkah datang dari backend, diturunkan dari usia dan target berat.
   * Query-nya sudah terisi dari beranda, jadi tidak menambah permintaan jaringan.
   */
  const target = useDailySummary(tanggal).data?.targets.steps;

  const [nilai, setNilai] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /**
   * Angka yang sedang diketik dilepas saat pindah tanggal, disesuaikan saat
   * render dan bukan lewat useEffect.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(tanggal);
  if (tanggal !== tanggalTerakhir) {
    setTanggalTerakhir(tanggal);
    setNilai(null);
    setError(null);
    setPesan(null);
  }

  const langkah = nilai ?? today.data?.steps ?? 0;

  const simpan = () => {
    setError(null);
    setPesan(null);

    save.mutate(
      // Satu baris per hari, jadi mencatat ulang pada tanggal yang sama harus
      // memperbarui baris yang ada, bukan menambah baris baru yang akan
      // ditolak DUPLICATE_ENTRY.
      { id: today.data?.id, steps: langkah, logged_at: tanggal },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => setPesan('Langkah tersimpan'),
      },
    );
  };

  const batang = dateRange(awal, hariIni).map((hari) => {
    // null, bukan nol. Hari yang tidak dicatat berbeda dari hari tanpa langkah,
    // dan menggambarnya sebagai nol sama saja mengarang bahwa user diam saja.
    const log = riwayat.data?.find((l) => l.logged_at === hari);
    return { label: dayLabel(hari), value: log?.steps ?? null };
  });

  return (
    <>
      <SectionHeader title={'Langkah ' + dayPhrase(tanggal)} />

      <DateField value={tanggal} onChange={setTanggal} />

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
              <span className="t-caption c-secondary">
                {target?.custom ? 'Target harian (pilihanmu)' : 'Target harian'}
              </span>
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
              Target kesehatan saja. Paluch dkk. 2022 menunjukkan manfaatnya
              mendatar sekitar 8.000, bukan 10.000. Langkah adalah pantauan,
              tidak masuk hitungan kalori, jadi tidak ada lapisan "tambahan untuk
              target berat" yang dulu bisa menggelembung sampai 20.000.
            */}
            {/* Target milik user: langkah cuma pantauan, jadi angka realistisnya dia yang tahu. */}
            <button
              type="button"
              className="link-btn t-label c-accent"
              onClick={() => setUbahTarget(true)}
            >
              Ubah target
            </button>

            <span className="t-caption c-tertiary">
              Langkah untuk memantau seberapa banyak kamu bergerak, bukan bahan hitung kalori. Jalan
              kaki yang sungguhan dicatat sebagai olahraga.
            </span>
          </div>

          {error ? <ErrorNote message={error} /> : null}
          {pesan ? <span className="t-caption c-success">{pesan}</span> : null}

          <Button label="Simpan" size="lg" full onClick={simpan} loading={save.isPending} />
        </div>
      </Card>

      <SectionHeader title="Tujuh hari terakhir" />

      <Card>
        {riwayat.isPending ? (
          <Loading />
        ) : (
          <HighlightBarChart data={batang} color={metricColors.steps} />
        )}
      </Card>

      {today.data ? (
        <Card padding="md">
          <div className="log-row">
            <span className="log-row-icon">
              <FootprintsIcon size={16} color={metricColors.steps} weight="fill" />
            </span>

            <span className="flex-1">
              <span className="t-body-medium">{thousands(today.data.steps)} langkah</span>
              <span className="t-caption c-tertiary"> · {today.data.distance_km} km</span>
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

      {ubahTarget && target ? (
        <StepTargetModal
          current={target.steps}
          custom={target.custom}
          onClose={() => setUbahTarget(false)}
        />
      ) : null}
    </>
  );
};

/**
 * Mengubah target langkah harian. Padanan StepTargetSheet di mobile.
 *
 * Langkah cuma pantauan perilaku, tidak masuk hitungan kalori, jadi targetnya
 * milik user. Disimpan di profil (step_target) dan dipakai backend saat
 * menyusun target harian.
 */
const StepTargetModal = ({
  current,
  custom,
  onClose,
}: {
  current: number;
  custom: boolean;
  onClose: () => void;
}) => {
  const simpan = useSaveProfile('update');
  const [nilai, setNilai] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const kirim = (target: number | null) => {
    setError(null);
    simpan.mutate(
      { step_target: target },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Modal
      open
      title="Target langkah harian"
      onClose={onClose}
      footer={
        <div className="stack-xs">
          {custom ? (
            <Button
              label="Kembali ke bawaan (8.000)"
              variant="secondary"
              full
              onClick={() => kirim(null)}
              loading={simpan.isPending}
            />
          ) : null}
          <Button
            label="Simpan target"
            size="lg"
            full
            onClick={() => kirim(nilai)}
            loading={simpan.isPending}
          />
        </div>
      }
    >
      <Stepper
        value={nilai}
        onChange={setNilai}
        step={500}
        min={1000}
        max={40_000}
        suffix="langkah"
      />
      <span className="t-caption c-tertiary">
        Pilih angka yang benar-benar bisa kamu capai. Bawaannya 8.000, titik di mana manfaat
        kesehatannya mendatar menurut penelitian.
      </span>
      {error ? <ErrorNote message={error} /> : null}
    </Modal>
  );
};
