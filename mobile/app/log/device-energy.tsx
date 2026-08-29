import { InfoIcon, WatchIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LogActions } from '@/components/features/LogActions';
import {
  Button,
  Card,
  ChipGroup,
  DateStrip,
  ErrorNote,
  Header,
  Input,
  Loading,
  Row,
  Screen,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
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
export default function DeviceEnergyScreen() {
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
   * Isian dikosongkan saat pindah tanggal, disetel ulang saat render dan bukan
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

  /*
    Kalau tanggal itu sudah dicatat, isian dibuka dengan nilai tersimpan supaya
    user menyunting, bukan mengetik ulang dari nol. Yang dikembalikan adalah
    angka yang DIA masukkan dulu, bukan hasil turunannya: kalau dulu mengisi
    kalori aktif, yang muncul kalori aktif lagi.
  */
  if (!terisi && hari.data) {
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
        source: perangkat.trim() === '' ? undefined : perangkat.trim(),
        logged_at: tanggal,
      },
      {
        onSuccess: () => setPesan('Kalori perangkat tersimpan'),
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  const hapus = () => {
    if (!hari.data) return;

    hapusKalori.mutate(hari.data.id, {
      onSuccess: () => {
        setKalori('');
        setPerangkat('');
        setTerisi(false);
        setPesan(null);
      },
      onError: (e) => setError(toApiError(e).message),
    });
  };

  const selisih = rumus !== null && hari.data ? hari.data.total_kcal - rumus : null;

  return (
    <Screen>
      <Header
        title="Kalori smartwatch"
        subtitle={hari.data ? 'Sudah dicatat ' + dayPhrase(tanggal) : 'Satu angka per hari'}
        action={
          hari.data ? (
            <LogActions
              row
              onDelete={hapus}
              deleteMessage={
                'Kalori perangkat ' +
                dayPhrase(tanggal) +
                ' akan dihapus, dan hitungannya kembali memakai rumus.'
              }
            />
          ) : undefined
        }
      />

      <DateStrip value={tanggal} onChange={setTanggal} />

      {/*
          Jam tangan tidak semuanya menampilkan angka yang sama. Sebagian punya
          keduanya, sebagian HANYA kalori aktif. Menanyakannya di depan lebih
          baik daripada menolak angkanya belakangan dengan pesan error.
        */}
      <Card variant="outline" padding="md">
        <View style={styles.hint}>
          <InfoIcon size={20} color={colors.warning} weight="duotone" />
          <Text variant="caption" tone="secondary" style={styles.hintText}>
            Kalori total sudah termasuk yang terbakar saat kamu diam; kalori aktif belum. Pilih yang
            sesuai dengan angka di jam tanganmu, dan sisanya dihitung di sini.
          </Text>
        </View>
      </Card>

      {hari.isPending ? (
        <Loading />
      ) : (
        <>
          <Card>
            <View style={styles.card}>
              <View style={styles.iconRow}>
                <WatchIcon size={26} color={metricColors.device} weight="duotone" />
                <Text variant="overline" tone="tertiary">
                  {'Kalori keluar ' + dayPhrase(tanggal)}
                </Text>
              </View>

              <View style={styles.group}>
                <Text variant="label" tone="secondary">
                  Jam tanganmu menampilkan yang mana?
                </Text>
                <ChipGroup
                  options={JENIS}
                  value={jenis}
                  onChange={setJenis}
                  labels={JENIS_LABEL}
                  wrap
                />
              </View>

              <Input
                label={pakaiAktif ? 'Kalori aktif hari ini' : 'Kalori total hari ini'}
                value={kalori}
                onChangeText={setKalori}
                placeholder={pakaiAktif ? '620' : '2340'}
                keyboardType="number-pad"
                suffix="kkal"
                hint={
                  pakaiAktif
                    ? 'Catat sebelum tidur, supaya seharian penuh sudah terhitung.'
                    : undefined
                }
              />

              {/*
                  Penjumlahannya diperlihatkan, bukan terjadi diam-diam di
                  backend. User harus bisa melihat angka mana yang dia berikan
                  dan angka mana yang ditambahkan aplikasi.
                */}
              {pakaiAktif && angkaValid ? (
                bmr === null ? (
                  <Text variant="caption" tone="warning">
                    Metabolisme istirahatmu belum bisa dihitung. Lengkapi profil dan catat berat
                    badanmu dulu.
                  </Text>
                ) : (
                  <View style={styles.hitungan}>
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
                    <Text variant="caption" tone="tertiary">
                      BMR itu taksiran dari tinggi, berat, usia, dan jenis kelaminmu, bukan
                      pengukuran. Angka aslinya tetap disimpan supaya bisa ditelusuri.
                    </Text>
                  </View>
                )
              ) : null}

              <Input
                label="Perangkat"
                value={perangkat}
                onChangeText={setPerangkat}
                placeholder="Opsional. Misalnya: Galaxy Watch"
                autoCapitalize="words"
                maxLength={64}
              />
            </View>
          </Card>

          {/*
              Perbandingan dengan rumus. Ini alasan fitur ini berguna melampaui
              sekadar mengganti satu angka: begitu terlihat seberapa jauh
              keduanya berbeda, user bisa menilai sendiri seberapa layak jam
              tangannya dipercaya.
            */}
          {rumus !== null ? (
            <Card padding="md">
              <View style={styles.banding}>
                <Row label="Hitungan rumus aplikasi" value={thousands(rumus) + ' kkal'} />

                {hari.data ? (
                  <>
                    <Row
                      label="Menurut jam tanganmu"
                      value={thousands(hari.data.total_kcal) + ' kkal'}
                      tone="accent"
                    />

                    {selisih !== null ? (
                      <Text variant="caption" tone="tertiary">
                        {selisih === 0
                          ? 'Keduanya persis sama.'
                          : 'Jam tanganmu ' +
                            (selisih > 0 ? 'lebih tinggi ' : 'lebih rendah ') +
                            thousands(Math.abs(selisih)) +
                            ' kkal. Perangkat pergelangan memang dikenal kurang akurat menaksir kalori, jadi selisih sebesar ini wajar dan belum tentu rumusnya yang salah.'}
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text variant="caption" tone="tertiary">
                    Simpan angka jam tanganmu untuk membandingkannya dengan hitungan ini.
                  </Text>
                )}
              </View>
            </Card>
          ) : null}

          {error ? <ErrorNote message={error} /> : null}
          {pesan ? (
            <Text variant="caption" tone="success" align="center">
              {pesan}
            </Text>
          ) : null}

          <Button
            label={hari.data ? 'Perbarui angka' : 'Simpan angka'}
            onPress={simpan}
            loading={simpanKalori.isPending}
            disabled={!angkaValid}
            size="lg"
          />

          <Card variant="outline" padding="md">
            <Text variant="caption" tone="tertiary">
              Angka ini menggantikan hitungan kalori keluar hari itu, bukan ditambahkan. Jam
              tanganmu sudah memuat jalan kaki dan kegiatan sehari-hari, jadi menjumlahkan keduanya
              berarti menghitung waktu yang sama dua kali. Olahraga yang kamu tandai tidak terekam
              jam tetap ditambahkan di atasnya.
            </Text>
          </Card>

          <Card variant="outline" padding="md">
            <Text variant="caption" tone="tertiary">
              Jatah kalori harianmu tidak ikut berubah. Jatah itu memang sengaja stabil supaya kamu
              tahu berapa yang boleh dimakan sejak pagi, bukan baru setelah harinya berakhir.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.lg },
  group: { gap: spacing.md },
  iconRow: { alignItems: 'center', gap: spacing.sm },
  hint: { flexDirection: 'row', gap: spacing.md },
  /* flex: 1 supaya teksnya membungkus, bukan menembus keluar kartu. Teks di
     dalam baris mendatar tidak pernah membungkus sendiri tanpa ini. */
  hintText: { flex: 1 },
  hitungan: { gap: spacing.sm },
  banding: { gap: spacing.sm },
});
