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
  useStepsRange,
  useStepsToday,
} from '@/services/steps.service';
import { dateRange, dayLabel, shiftDays, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';

const TARGET_HARIAN = 10_000;

/**
 * Membaca langkah hari ini dari sensor perangkat.
 *
 * getStepCountAsync hanya tersedia di iOS — Android tidak menyimpan riwayat
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
  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -6);

  const today = useStepsToday();
  const riwayat = useStepsRange(awal, hariIni);
  const saveSteps = useSaveSteps();
  const deleteSteps = useDeleteSteps();

  const logHariIni = today.data ?? null;

  const sensor = useLangkahSensor();

  const [langkah, setLangkah] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const nilai = langkah ?? today.data?.steps ?? 0;

  const batang: BarDatum[] = dateRange(awal, hariIni).map((tanggal) => {
    const jumlah = riwayat.data?.find((l) => l.logged_at === tanggal)?.steps ?? 0;
    return { label: dayLabel(tanggal), value: jumlah, caption: thousands(jumlah) };
  });

  const simpan = () => {
    setError(null);
    setPesan(null);

    saveSteps.mutate(
      { id: today.data?.id, steps: nilai },
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
        subtitle="Satu catatan per hari"
        action={
          logHariIni ? (
            <LogActions
              onDelete={() => deleteSteps.mutate(logHariIni.id)}
              deleteMessage="Catatan langkah hari ini akan dihapus."
              row
            />
          ) : undefined
        }
      />

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
                target={TARGET_HARIAN}
                unit="langkah"
                color={metricColors.steps}
              />
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
