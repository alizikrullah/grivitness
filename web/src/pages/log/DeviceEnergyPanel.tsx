import { InfoIcon, WatchIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  ChipGroup,
  ErrorNote,
  Input,
  Loading,
  Row,
  SectionHeader,
} from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import {
  useDeleteDeviceEnergy,
  useDeviceEnergyDate,
  useSaveDeviceEnergy,
} from '@/services/device-energy.service';
import { useDailySummary } from '@/services/misc.service';
import { useProfile } from '@/services/users.service';
import { dayPhrase, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';
import { LogActions } from './LogActions';

/**
 * Angka apa yang ditampilkan jam tangan user.
 *
 * Sebagian perangkat hanya punya kalori aktif, jadi memaksa angka total berarti
 * fiturnya tidak bisa dipakai sama sekali di perangkat seperti itu. AKTIF jadi
 * pilihan bawaan karena itu yang paling umum tersedia.
 */
const JENIS = ['ACTIVE', 'TOTAL'] as const;
const JENIS_LABEL = { ACTIVE: 'Kalori aktif', TOTAL: 'Kalori total' };

type Jenis = (typeof JENIS)[number];

/**
 * Mencatat kalori jam tangan seharian. Padanan layar mobile.
 *
 * Kalori AKTIF jam DITAMBAHKAN ke metabolisme dan pekerjaan hari itu (BMR x
 * PAL), bersama olahraga yang ditandai TIDAK terekam jam. Versi lama memakai
 * angka jam sebagai PENGGANTI rumus, dan hari jamnya dilepas jatuh ke sekitar
 * BMR. Angka total jam diubah jadi aktif di backend: total dikurangi BMR.
 */
export const DeviceEnergyPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());

  const hari = useDeviceEnergyDate(tanggal);
  const simpanKalori = useSaveDeviceEnergy();
  const hapusKalori = useDeleteDeviceEnergy();

  const ringkasan = useDailySummary(tanggal).data;
  const bmr = useProfile().data?.bmr ?? null;

  const [jenis, setJenis] = useState<Jenis>('ACTIVE');
  const [kalori, setKalori] = useState('');
  const [perangkat, setPerangkat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [terisi, setTerisi] = useState(false);

  /**
   * Isian dikosongkan saat pindah tanggal, disesuaikan saat render dan bukan
   * lewat useEffect. Tanpa ini, angka hari kemarin terisi angka hari ini yang
   * barusan dilihat, dan menyimpannya menulis nilai salah ke hari salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(tanggal);
  if (tanggal !== tanggalTerakhir) {
    setTanggalTerakhir(tanggal);
    setKalori('');
    setPerangkat('');
    setError(null);
    setPesan(null);
    setTerisi(false);
  }

  // Kalau tanggal itu sudah dicatat, isian dibuka dengan nilai tersimpan supaya
  // user menyunting, bukan mengetik ulang dari nol.
  if (!terisi && hari.data) {
    // Yang dikembalikan adalah angka yang DIA masukkan dulu, bukan hasil
    // turunannya: kalau dulu mengisi kalori aktif, yang muncul kalori aktif lagi.
    const aktifTersimpan = hari.data.active_kcal;

    setJenis(aktifTersimpan === null ? 'TOTAL' : 'ACTIVE');
    setKalori(String(aktifTersimpan ?? hari.data.total_kcal));
    setPerangkat(hari.data.source ?? '');
    setTerisi(true);
  }

  /** Susunan kalori keluar hari itu dari backend, untuk diperlihatkan apa adanya. */
  const energi = ringkasan?.energy ?? null;

  const angka = Number(kalori.trim());
  const angkaValid = kalori.trim() !== '' && Number.isFinite(angka) && angka >= 0;

  const pakaiAktif = jenis === 'ACTIVE';

  /**
   * Bagian aktif yang akan dihitung, diperlihatkan sebelum disimpan. Angka
   * total jam memuat istirahat versi jam, yang sudah ditanggung BMR x PAL.
   */
  const aktifDihitung = ((): number | null => {
    if (!angkaValid) return null;
    if (pakaiAktif) return angka;
    if (bmr === null) return null;
    return Math.max(angka - Math.round(bmr), 0);
  })();

  const simpan = () => {
    setError(null);
    setPesan(null);

    if (!angkaValid) {
      setError('Isi angka kalorinya dulu');
      return;
    }

    simpanKalori.mutate(
      {
        ...(pakaiAktif ? { active_kcal: Math.round(angka) } : { total_kcal: Math.round(angka) }),
        source: perangkat.trim() || undefined,
        logged_at: tanggal,
      },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => setPesan('Kalori perangkat tersimpan'),
      },
    );
  };

  return (
    <>
      <SectionHeader title={'Kalori smartwatch ' + dayPhrase(tanggal)} />

      <DateNav value={tanggal} onChange={setTanggal} section="device-energy" />

      {/*
        Jam tangan tidak semuanya menampilkan angka yang sama. Sebagian punya
        keduanya, sebagian HANYA kalori aktif. Menanyakannya di depan lebih baik
        daripada menolak angkanya belakangan dengan pesan error.
      */}
      <Card variant="outline" padding="md">
        <div className="row-start">
          <InfoIcon size={20} color={metricColors.device} weight="duotone" />
          <span className="t-caption c-secondary flex-1">
            Kalori total sudah termasuk yang terbakar saat kamu diam; kalori aktif belum. Pilih yang
            sesuai dengan angka di jam tanganmu, dan sisanya dihitung di sini.
          </span>
        </div>
      </Card>

      {hari.isPending ? (
        <Loading />
      ) : (
        <>
          <Card>
            <div className="stack">
              <div className="row-between">
                <span className="t-label c-secondary">
                  <WatchIcon size={16} color={metricColors.device} weight="duotone" /> Kalori keluar
                </span>

                {hari.data ? (
                  <LogActions
                    onDelete={() =>
                      hapusKalori.mutate(hari.data?.id ?? '', {
                        onError: (e) => setError(toApiError(e).message),
                        onSuccess: () => {
                          setKalori('');
                          setPerangkat('');
                          setTerisi(false);
                          setPesan(null);
                        },
                      })
                    }
                    confirmMessage={
                      'Kalori perangkat ' +
                      dayPhrase(tanggal) +
                      ' akan dihapus, dan hitungannya kembali memakai rumus.'
                    }
                  />
                ) : null}
              </div>

              <div className="stack-xs">
                <span className="t-label c-secondary">Jam tanganmu menampilkan yang mana?</span>
                <ChipGroup options={JENIS} value={jenis} onChange={setJenis} labels={JENIS_LABEL} />
              </div>

              <Input
                label={pakaiAktif ? 'Kalori aktif hari ini' : 'Kalori total hari ini'}
                inputMode="numeric"
                value={kalori}
                onChange={(e) => setKalori(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={pakaiAktif ? '620' : '2340'}
                suffix="kkal"
                hint={
                  pakaiAktif
                    ? 'Catat sebelum tidur, supaya seharian penuh sudah terhitung.'
                    : undefined
                }
              />

              {/*
                Penjumlahannya diperlihatkan, bukan terjadi diam-diam di backend.
                User harus bisa melihat angka mana yang dia berikan dan angka
                mana yang ditambahkan aplikasi.
              */}
              {angkaValid && bmr === null ? (
                <span className="t-caption c-warning">
                  Metabolisme istirahatmu belum bisa dihitung. Lengkapi profil dan catat berat
                  badanmu dulu.
                </span>
              ) : !pakaiAktif && angkaValid && bmr !== null ? (
                <div className="stack-sm">
                  <Row label="Total dari jam" value={thousands(angka) + ' kkal'} />
                  <Row
                    label="Dikurangi metabolisme istirahat (BMR)"
                    value={thousands(Math.round(bmr)) + ' kkal'}
                  />
                  <Row
                    label="Bagian aktif yang ditambahkan"
                    value={thousands(aktifDihitung ?? 0) + ' kkal'}
                    tone="accent"
                  />
                  <span className="t-caption c-tertiary">
                    Istirahatmu sudah dihitung aplikasi dari BMR dan jenis pekerjaanmu, jadi dari
                    angka total jam yang ditambahkan cuma bagian aktifnya.
                  </span>
                </div>
              ) : null}

              <Input
                label="Perangkat"
                value={perangkat}
                onChange={(e) => setPerangkat(e.target.value)}
                placeholder="Opsional. Misalnya: Galaxy Watch"
                maxLength={64}
              />

              {error ? <ErrorNote message={error} /> : null}
              {pesan ? <span className="t-caption c-success">{pesan}</span> : null}

              <Button
                label={hari.data ? 'Perbarui angka' : 'Simpan angka'}
                size="lg"
                full
                onClick={simpan}
                loading={simpanKalori.isPending}
                disabled={!angkaValid}
              />
            </div>
          </Card>

          {/*
            Susunan kalori keluar hari itu, apa adanya dari backend: angka mana
            yang diberikan user dan angka mana yang dihitung aplikasi.
          */}
          {energi && ringkasan ? (
            <Card padding="md">
              <div className="stack-sm">
                <Row
                  label="Metabolisme dan pekerjaan"
                  value={thousands(energi.baseline) + ' kkal'}
                />
                {energi.device_active_kcal === null ? (
                  <Row label="Olahraga" value={thousands(energi.workout_calories) + ' kkal'} />
                ) : (
                  <>
                    <Row
                      label="Kalori aktif jam"
                      value={thousands(energi.device_active_kcal) + ' kkal'}
                    />
                    <Row
                      label="Olahraga di luar jam"
                      value={thousands(energi.workout_calories) + ' kkal'}
                    />
                  </>
                )}
                <Row
                  label={'Kalori keluar ' + dayPhrase(tanggal)}
                  value={thousands(ringkasan.calories_out) + ' kkal'}
                  tone="accent"
                />
                {hari.data ? null : (
                  <span className="t-caption c-tertiary">
                    Simpan angka jam tanganmu, dan kalori aktifnya ditambahkan ke sini.
                  </span>
                )}
              </div>
            </Card>
          ) : null}

          <Card variant="outline" padding="md">
            <span className="t-caption c-tertiary">
              Kalori aktif jam ditambahkan ke metabolisme dan pekerjaanmu, bukan menggantikannya.
              Jam cuma melihat gerak saat dipakai, jadi hari jamnya dilepas tidak lagi jatuh ke
              sekitar BMR. Olahraga yang kamu centang terekam jam tidak ditambah lagi, karena sudah
              ada di angka aktif itu. Jatah kalori harianmu sendiri tidak ikut berubah.
            </span>
          </Card>
        </>
      )}
    </>
  );
};
