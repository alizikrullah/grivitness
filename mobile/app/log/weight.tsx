import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  DateStrip,
  ErrorNote,
  Header,
  Input,
  LineChart,
  Loading,
  Screen,
  SectionHeader,
  Stepper,
  Text,
  type LinePoint,
} from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import {
  useCreateWeight,
  useUpdateWeight,
  useWeightDate,
  useWeightRange,
} from '@/services/weight.service';
import { dayPhrase, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { signed, toNum } from '@/utils/format';

/** Berat awal saat user belum punya catatan apa pun. */
const BERAT_AWAL = 70;

export default function WeightScreen() {
  const router = useRouter();

  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan membetulkan penimbangan hari-hari sebelumnya.
   */
  const [tanggal, setTanggal] = useState(todayWIB());

  // Chart tetap berlabuh pada hari ini apa pun tanggal yang sedang dibuka.
  // Kalau ikut bergeser, bentuk trennya berubah setiap kali user menoleh ke
  // belakang dan jadi tidak bisa dijadikan pegangan.
  const akhirRentang = todayWIB();
  const hariAwal = shiftDays(akhirRentang, -29);

  const today = useWeightDate(tanggal);
  const riwayat = useWeightRange(hariAwal, akhirRentang);

  const createWeight = useCreateWeight();
  const updateWeight = useUpdateWeight();

  const [berat, setBerat] = useState<number | null>(null);
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);

  /**
   * Angka yang sedang diketik dilepas saat pindah tanggal, disetel ulang saat
   * render dan bukan lewat useEffect.
   *
   * Tanpa ini, berat yang tampil untuk 20 Agustus adalah angka yang barusan
   * dilihat di 23 Agustus, dan menyimpannya akan menulis nilai yang salah ke
   * hari yang salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(tanggal);
  if (tanggal !== tanggalTerakhir) {
    setTanggalTerakhir(tanggal);
    setBerat(null);
    setCatatan('');
    setError(null);
  }

  const memuat = today.isPending || riwayat.isPending;

  // Nilai awal stepper: berat hari ini kalau sudah tercatat, kalau belum maka
  // catatan terakhir, karena berat besok hampir selalu dekat dengan hari ini.
  const terakhir = riwayat.data?.[riwayat.data.length - 1];
  const nilaiAwal = toNum(today.data?.weight_kg) ?? toNum(terakhir?.weight_kg) ?? BERAT_AWAL;

  const nilai = berat ?? nilaiAwal;
  const sudahAda = today.data !== null && today.data !== undefined;

  const titik: LinePoint[] = (riwayat.data ?? []).map((log) => ({
    label: shortDate(log.logged_at),
    value: toNum(log.weight_kg),
  }));

  const pertama = toNum(riwayat.data?.[0]?.weight_kg);
  const selisih = pertama !== null ? nilai - pertama : null;

  const simpan = () => {
    setError(null);

    const onError = (e: unknown) => setError(toApiError(e).message);
    const onSuccess = () => router.back();

    if (sudahAda && today.data) {
      updateWeight.mutate(
        {
          id: today.data.id,
          weight_kg: nilai,
          notes: catatan.trim() === '' ? undefined : catatan.trim(),
        },
        { onSuccess, onError },
      );
      return;
    }

    createWeight.mutate(
      {
        weight_kg: nilai,
        notes: catatan.trim() === '' ? undefined : catatan.trim(),
        // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
        logged_at: tanggal,
      },
      { onSuccess, onError },
    );
  };

  return (
    <Screen>
      <Header
        title="Berat badan"
        subtitle={(sudahAda ? 'Sudah dicatat ' : 'Belum dicatat ') + dayPhrase(tanggal)}
      />

      <DateStrip value={tanggal} onChange={setTanggal} />

      {memuat ? (
        <Loading />
      ) : (
        <>
          <Card>
            <View style={styles.stepperCard}>
              <Text variant="overline" tone="tertiary" align="center">
                {'Berat ' + dayPhrase(tanggal)}
              </Text>

              <Stepper
                value={nilai}
                onChange={setBerat}
                step={0.1}
                decimals={1}
                min={20}
                max={400}
                suffix="kg"
              />

              {selisih !== null ? (
                <Text
                  variant="caption"
                  align="center"
                  tone={selisih <= 0 ? 'success' : 'secondary'}
                >
                  {signed(selisih)} kg dibanding 30 hari lalu
                </Text>
              ) : null}
            </View>
          </Card>

          <Input
            label="Catatan"
            value={catatan}
            onChangeText={setCatatan}
            placeholder="Opsional. Misalnya: setelah puasa semalam"
            multiline
            maxLength={1000}
            autoCapitalize="sentences"
          />

          {error ? <ErrorNote message={error} /> : null}

          <Button
            label={sudahAda ? 'Perbarui berat' : 'Simpan berat'}
            onPress={simpan}
            loading={createWeight.isPending || updateWeight.isPending}
            size="lg"
          />

          {titik.length > 0 ? (
            <>
              <SectionHeader title="30 hari terakhir" />
              <Card>
                <LineChart data={titik} color={metricColors.weight} />
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepperCard: { gap: spacing.lg },
});
