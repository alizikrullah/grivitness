import { Pedometer } from 'expo-sensors';
import { DeviceMobileIcon, FootprintsIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LogActions } from '@/components/features/LogActions';
import { GoalProgress } from '@/components/features/Metrics';
import {
  BarChart,
  Button,
  Card,
  DateStrip,
  ErrorNote,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Stepper,
  Text,
  type BarDatum,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import {
  useDeleteSteps,
  useSaveSteps,
  useStepsDate,
  useStepsRange,
} from '@/services/steps.service';
import { useDailySummary } from '@/services/misc.service';
import { dateRange, dayLabel, dayPhrase, shiftDays, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';

/**
 * Membaca langkah hari ini dari sensor perangkat.
 *
 * getStepCountAsync hanya tersedia di iOS, Android tidak menyimpan riwayat
 * langkah yang bisa dibaca begitu saja. Karena itu kegagalannya diperlakukan
 * sebagai "sensor tidak tersedia", bukan sebagai kesalahan; user tetap bisa
 * mengisi angkanya sendiri.
 */
const useLangkahSensor = () => {
  const [langkah, setLangkah] = useState<number | null>(null);
  const [tersedia, setTersedia] = useState(false);

  useEffect(() => {
    let batal = false;

    const baca = async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return;

        const izin = await Pedometer.requestPermissionsAsync();
        if (!izin.granted) return;

        if (batal) return;
        setTersedia(true);

        const akhir = new Date();
        const awal = new Date(akhir);
        awal.setHours(0, 0, 0, 0);

        const hasil = await Pedometer.getStepCountAsync(awal, akhir);
        if (!batal) setLangkah(hasil.steps);
      } catch {
        // Sensor tidak bisa dibaca di perangkat ini. Input manual tetap jalan.
      }
    };

    void baca();
    return () => {
      batal = true;
    };
  }, []);

  return { langkah, tersedia };
};

export default function StepsScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [dipilih, setDipilih] = useState(todayWIB());

  // Chart tetap berlabuh pada hari ini apa pun tanggal yang sedang dibuka,
  // supaya bentuk sepekannya tidak ikut bergeser setiap kali user menoleh ke
  // belakang.
  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -6);

  const today = useStepsDate(dipilih);
  const riwayat = useStepsRange(awal, hariIni);
  const saveSteps = useSaveSteps();
  const deleteSteps = useDeleteSteps();

  /**
   * Target langkah datang dari backend, diturunkan dari usia dan target berat
   * badan. Query-nya sudah terisi dari beranda, jadi ini tidak menambah
   * permintaan jaringan dalam pemakaian normal.
   */
  const target = useDailySummary(dipilih).data?.targets.steps;

  const logHariIni = today.data ?? null;

  const sensor = useLangkahSensor();

  const [langkah, setLangkah] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /**
   * Angka yang sedang diketik dilepas saat pindah tanggal, disetel ulang saat
   * render dan bukan lewat useEffect. Tanpa ini, angka hari kemarin yang tampil
   * adalah angka hari ini yang barusan dilihat.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(dipilih);
  if (dipilih !== tanggalTerakhir) {
    setTanggalTerakhir(dipilih);
    setLangkah(null);
    setError(null);
    setPesan(null);
  }

  const nilai = langkah ?? today.data?.steps ?? 0;

  const batang: BarDatum[] = dateRange(awal, hariIni).map((tanggal) => {
    // null, bukan nol. Hari yang tidak dicatat berbeda dari hari tanpa langkah,
    // dan menggambarnya sebagai nol sama saja mengarang bahwa user diam saja.
    const log = riwayat.data?.find((l) => l.logged_at === tanggal);
    const jumlah = log?.steps ?? null;

    return {
      label: dayLabel(tanggal),
      value: jumlah,
      caption: jumlah === null ? undefined : thousands(jumlah),
    };
  });

  const simpan = () => {
    setError(null);
    setPesan(null);

    saveSteps.mutate(
      // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
      { id: today.data?.id, steps: nilai, logged_at: dipilih },
      {
        onSuccess: () => setPesan('Langkah tersimpan'),
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Screen>
      <Header
        title="Langkah kaki"
        subtitle={'Satu catatan per hari · ' + dayPhrase(dipilih)}
        action={
          logHariIni ? (
            <LogActions
              onDelete={() => deleteSteps.mutate(logHariIni.id)}
              deleteMessage={'Catatan langkah ' + dayPhrase(dipilih) + ' akan dihapus.'}
              row
            />
          ) : undefined
        }
      />

      <DateStrip value={dipilih} onChange={setDipilih} />

      {today.isPending ? (
        <Loading />
      ) : (
        <>
          <Card>
            <View style={styles.card}>
              <View style={styles.iconRow}>
                <FootprintsIcon size={28} color={metricColors.steps} weight="duotone" />
                <Text variant="overline" tone="tertiary">
                  Langkah hari ini
                </Text>
              </View>

              <Stepper
                value={nilai}
                onChange={setLangkah}
                step={500}
                min={0}
                max={200_000}
                suffix="langkah"
              />

              <GoalProgress
                label="Target harian"
                value={nilai}
                target={target?.steps ?? 0}
                unit="langkah"
                color={metricColors.steps}
              />

              {/*
                Dua lapis, dan pemisahannya disengaja. Lapis pertama murni
                kesehatan, Paluch dkk. 2022 menunjukkan manfaatnya mendatar
                sekitar 8.000, bukan 10.000. Lapis kedua muncul cuma kalau
                target beratmu tidak bisa dikejar dari makanan saja tanpa
                menembus batas aman, jadi angkanya bisa dijelaskan.
              */}
              {target && target.for_goal > 0 ? (
                <Text variant="caption" tone="tertiary">
                  {thousands(target.baseline)} untuk kesehatan, {thousands(target.for_goal)} sisanya
                  untuk mengejar target beratmu.
                </Text>
              ) : null}
            </View>
          </Card>

          {sensor.tersedia && sensor.langkah !== null ? (
            <Card variant="outline">
              <View style={styles.sensorRow}>
                <DeviceMobileIcon size={22} color={colors.textSecondary} weight="duotone" />
                <View style={styles.sensorText}>
                  <Text variant="label">Sensor mencatat {thousands(sensor.langkah)} langkah</Text>
                  <Text variant="caption" tone="secondary">
                    Angka dari pedometer perangkat sejak tengah malam.
                  </Text>
                </View>
                <Button
                  label="Pakai"
                  onPress={() => setLangkah(sensor.langkah ?? 0)}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                />
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
            label={today.data ? 'Perbarui langkah' : 'Simpan langkah'}
            onPress={simpan}
            loading={saveSteps.isPending}
            size="lg"
          />

          <SectionHeader title="7 hari terakhir" />
          <Card>
            <BarChart data={batang} color={metricColors.steps} formatValue={thousands} />
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xl },
  iconRow: { alignItems: 'center', gap: spacing.sm },
  sensorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sensorText: { flex: 1, gap: 2 },
});
