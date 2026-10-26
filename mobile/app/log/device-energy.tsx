import { InfoIcon, WatchIcon } from 'phosphor-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, type TextInput, View } from 'react-native';

import { LogActions } from '@/components/features/LogActions';
import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  Chip,
  ChipGroup,
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
import { useTanggalAwal } from '@/hooks/useTanggalAwal';
import { toApiError } from '@/lib/api';
import {
  useDeleteDeviceEnergy,
  useDeviceEnergyDate,
  useDeviceEnergyRange,
  useSaveDeviceEnergy,
} from '@/services/device-energy.service';
import { useDailySummary } from '@/services/misc.service';
import { useProfile } from '@/services/users.service';
import { dayPhrase, shiftDays, todayWIB } from '@/utils/date';
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
 * Mencatat kalori jam tangan seharian.
 *
 * Kalori AKTIF jam DITAMBAHKAN ke metabolisme dan pekerjaan hari itu (BMR x
 * PAL), bersama olahraga yang ditandai TIDAK terekam jam. Versi lama memakai
 * angka jam sebagai PENGGANTI rumus, dan hari jamnya dilepas jatuh ke sekitar
 * BMR. Angka total jam diubah jadi aktif di backend: total dikurangi BMR.
 */
export default function DeviceEnergyScreen() {
  const [tanggal, setTanggal] = useState(useTanggalAwal());
  const kolomPerangkat = useRef<TextInput>(null);

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
  const [perangkatDitebak, setPerangkatDitebak] = useState(false);

  /**
   * Nama perangkat yang pernah dipakai 90 hari terakhir, terbaru dulu. Yang
   * terakhir otomatis mengisi kolomnya untuk tanggal yang belum dicatat, jadi
   * cukup diketik sekali; yang lain jadi pilihan sekali sentuh.
   */
  const hariIni = todayWIB();
  const riwayatJam = useDeviceEnergyRange(shiftDays(hariIni, -89), hariIni);
  const namaPerangkat = [...(riwayatJam.data ?? [])]
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at))
    .map((r) => r.source?.trim() ?? '')
    .filter((nama, i, semua) => nama !== '' && semua.indexOf(nama) === i)
    .slice(0, 4);

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
    setPerangkatDitebak(false);
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

  // Tanggal yang belum dicatat: kolom perangkat diisi nama yang terakhir dipakai.
  const namaTerakhir = namaPerangkat[0];
  if (!perangkatDitebak && !hari.isPending && !hari.data && namaTerakhir !== undefined) {
    setPerangkatDitebak(true);
    if (perangkat === '') setPerangkat(namaTerakhir);
  }

  /** Susunan kalori keluar hari itu dari backend, untuk diperlihatkan apa adanya. */
  const energi = ringkasan?.energy ?? null;

  const angka = Number(kalori.trim());
  const angkaValid = kalori.trim() !== '' && Number.isFinite(angka) && angka >= 0;

  const pakaiAktif = jenis === 'ACTIVE';

  /**
   * Bagian aktif yang akan dihitung, diperlihatkan sebelum disimpan supaya
   * tidak ada kejutan. Angka total jam memuat istirahat versi jam, dan bagian
   * itu sudah ditanggung BMR x PAL, jadi yang ditambahkan cuma sisanya.
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

      <DateNav value={tanggal} onChange={setTanggal} section="device-energy" />

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
                next={kolomPerangkat}
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
              {angkaValid && bmr === null ? (
                <Text variant="caption" tone="warning">
                  Metabolisme istirahatmu belum bisa dihitung. Lengkapi profil dan catat berat
                  badanmu dulu.
                </Text>
              ) : !pakaiAktif && angkaValid && bmr !== null ? (
                <View style={styles.hitungan}>
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
                  <Text variant="caption" tone="tertiary">
                    Istirahatmu sudah dihitung aplikasi dari BMR dan jenis pekerjaanmu, jadi dari
                    angka total jam yang ditambahkan cuma bagian aktifnya.
                  </Text>
                </View>
              ) : null}

              <Input
                ref={kolomPerangkat}
                label="Perangkat"
                value={perangkat}
                onChangeText={setPerangkat}
                placeholder="Opsional. Misalnya: Galaxy Watch"
                autoCapitalize="words"
                maxLength={64}
              />
              {namaPerangkat.length > 1 ? (
                <View style={styles.perangkat}>
                  {namaPerangkat.map((nama) => (
                    <Chip
                      key={nama}
                      size="sm"
                      label={nama}
                      active={perangkat.trim() === nama}
                      onPress={() => setPerangkat(nama)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </Card>

          {/*
              Susunan kalori keluar hari itu, apa adanya dari backend. User
              harus bisa melihat angka mana yang dia berikan dan angka mana
              yang dihitung aplikasi, bukan cuma satu total.
            */}
          {energi && ringkasan ? (
            <Card padding="md">
              <View style={styles.banding}>
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
                {energi.scale_correction === null ? null : (
                  <Row
                    label="Koreksi timbangan"
                    value={
                      (energi.scale_correction > 0 ? '+' : '') +
                      thousands(energi.scale_correction) +
                      ' kkal'
                    }
                  />
                )}
                <Row
                  label={'Kalori keluar ' + dayPhrase(tanggal)}
                  value={thousands(ringkasan.calories_out) + ' kkal'}
                  tone="accent"
                />
                {hari.data ? null : (
                  <Text variant="caption" tone="tertiary">
                    Simpan angka jam tanganmu, dan kalori aktifnya ditambahkan ke sini.
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
              Kalori aktif jam ditambahkan ke metabolisme dan pekerjaanmu, bukan menggantikannya.
              Jam cuma melihat gerak saat dipakai, jadi hari jamnya dilepas tidak lagi jatuh ke
              sekitar BMR. Olahraga yang kamu centang terekam jam tidak ditambah lagi, karena sudah
              ada di angka aktif itu.
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
  perangkat: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
