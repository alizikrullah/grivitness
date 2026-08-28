import { InfoIcon, WatchIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  Button,
  Card,
  ChipGroup,
  DateField,
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
 * Mencatat kalori keluar seharian menurut smartwatch.
 *
 * Angka ini MENGGANTIKAN hitungan TDEE hari itu di backend, bukan ditambahkan
 * ke atasnya. Jam tangan mengukur seluruh hari, jadi jalan kaki dan kegiatan
 * sehari-hari sudah ada di dalamnya, dan keduanya juga sudah dihitung dari
 * step_logs serta activity_level. Menjumlahkannya berarti menghitung jam yang
 * sama dua kali.
 *
 * Yang masih ditambahkan hanyalah olahraga yang ditandai TIDAK terekam jam,
 * misalnya berenang atau sesi yang jamnya kebetulan dilepas.
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

  /**
   * Hitungan rumus untuk hari itu, dipakai sebagai pembanding.
   *
   * Diambil dari rincian energi, bukan dari calories_out. Begitu angka
   * perangkat tersimpan, calories_out SUDAH berisi angka perangkat itu sendiri,
   * jadi memakainya sebagai pembanding berarti membandingkan sesuatu dengan
   * dirinya sendiri.
   */
  const energi = ringkasan?.energy;
  const rumus = energi
    ? Math.round(energi.baseline + energi.step_calories + energi.workout_calories)
    : null;

  const angka = Number(kalori.trim());
  const angkaValid = kalori.trim() !== '' && Number.isFinite(angka) && angka >= 0;

  const pakaiAktif = jenis === 'ACTIVE';

  /** Total yang akan tersimpan, diperlihatkan sebelum disimpan supaya tidak ada kejutan. */
  const totalSetelahnya = ((): number | null => {
    if (!angkaValid) return null;
    if (!pakaiAktif) return angka;
    if (bmr === null) return null;

    return Math.round(bmr) + angka;
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

  const selisih = rumus !== null && hari.data ? hari.data.total_kcal - rumus : null;

  return (
    <>
      <SectionHeader title={'Kalori smartwatch ' + dayPhrase(tanggal)} />

      <DateField value={tanggal} onChange={setTanggal} />

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
              {pakaiAktif && angkaValid ? (
                bmr === null ? (
                  <span className="t-caption c-warning">
                    Metabolisme istirahatmu belum bisa dihitung. Lengkapi profil dan catat berat
                    badanmu dulu.
                  </span>
                ) : (
                  <div className="stack-sm">
                    <Row
                      label="Metabolisme istirahat (BMR)"
                      value={thousands(Math.round(bmr)) + ' kkal'}
                    />
                    <Row label="Kalori aktif dari jam" value={thousands(angka) + ' kkal'} />
                    <Row
                      label="Total yang tersimpan"
                      value={thousands(totalSetelahnya ?? 0) + ' kkal'}
                      tone="accent"
                    />
                    <span className="t-caption c-tertiary">
                      BMR itu taksiran dari tinggi, berat, usia, dan jenis kelaminmu, bukan
                      pengukuran. Angka aslinya tetap disimpan supaya bisa ditelusuri.
                    </span>
                  </div>
                )
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
            Perbandingan dengan rumus. Ini alasan fitur ini berguna melampaui
            sekadar mengganti satu angka: begitu terlihat seberapa jauh keduanya
            berbeda, user bisa menilai sendiri seberapa layak jam tangannya
            dipercaya.
          */}
          {rumus !== null ? (
            <Card padding="md">
              <div className="stack-sm">
                <div className="row-between">
                  <span className="t-caption c-secondary">Hitungan rumus aplikasi</span>
                  <span className="t-label">{thousands(rumus)} kkal</span>
                </div>

                {hari.data ? (
                  <>
                    <div className="row-between">
                      <span className="t-caption c-secondary">Menurut jam tanganmu</span>
                      <span className="t-label c-accent">
                        {thousands(hari.data.total_kcal)} kkal
                      </span>
                    </div>

                    {selisih !== null ? (
                      <span className="t-caption c-tertiary">
                        {selisih === 0
                          ? 'Keduanya persis sama.'
                          : 'Jam tanganmu ' +
                            (selisih > 0 ? 'lebih tinggi ' : 'lebih rendah ') +
                            thousands(Math.abs(selisih)) +
                            ' kkal. Perangkat pergelangan memang dikenal kurang akurat menaksir kalori, jadi selisih sebesar ini wajar dan belum tentu rumusnya yang salah.'}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="t-caption c-tertiary">
                    Simpan angka jam tanganmu untuk membandingkannya dengan hitungan ini.
                  </span>
                )}
              </div>
            </Card>
          ) : null}

          <Card variant="outline" padding="md">
            <span className="t-caption c-tertiary">
              Angka ini menggantikan hitungan kalori keluar hari itu, bukan ditambahkan. Jam
              tanganmu sudah memuat jalan kaki dan kegiatan sehari-hari, jadi menjumlahkan keduanya
              berarti menghitung waktu yang sama dua kali. Olahraga yang kamu tandai tidak terekam
              jam tetap ditambahkan di atasnya. Jatah kalori harianmu sendiri tidak ikut berubah,
              karena jatah itu memang sengaja stabil.
            </span>
          </Card>
        </>
      )}
    </>
  );
};
