import { useRouter } from 'expo-router';
import { RulerIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ErrorNote,
  Header,
  Input,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import {
  MEASUREMENT_PARTS,
  useLatestMeasurement,
  useSaveMeasurement,
  type MeasurementInput,
  type MeasurementKey,
} from '@/services/measurements.service';
import { longDate, todayWIB } from '@/utils/date';
import { toNum } from '@/utils/format';

export default function MeasurementsScreen() {
  const router = useRouter();

  const latest = useLatestMeasurement();
  const saveMeasurement = useSaveMeasurement();

  const [nilai, setNilai] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const hariIni = todayWIB();
  const sudahHariIni = latest.data?.logged_at === hariIni;

  const ubah = (key: MeasurementKey, teks: string) =>
    setNilai((sebelum) => ({ ...sebelum, [key]: teks }));

  const simpan = () => {
    setError(null);

    const body: MeasurementInput = {};
    let adaIsi = false;

    for (const bagian of MEASUREMENT_PARTS) {
      const teks = nilai[bagian.key]?.trim();
      if (!teks) continue;

      const angka = Number(teks.replace(',', '.'));

      if (!Number.isFinite(angka) || angka < 10 || angka > 300) {
        setError(bagian.label + ' harus antara 10 sampai 300 cm');
        return;
      }

      body[bagian.key] = angka;
      adaIsi = true;
    }

    if (!adaIsi) {
      setError('Isi minimal satu ukuran badan');
      return;
    }

    // Satu baris per hari. Mencatat ulang di hari yang sama berarti memperbarui
    // baris yang ada, bukan membuat baris baru yang akan ditolak backend.
    saveMeasurement.mutate(
      { id: sudahHariIni ? latest.data?.id : undefined, ...body },
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <Header
          title="Ukuran badan"
          subtitle={sudahHariIni ? 'Sudah dicatat hari ini' : 'Isi yang kamu ukur saja'}
        />

        <Card variant="outline" padding="md">
          <View style={styles.hint}>
            <RulerIcon size={20} color={metricColors.measurement} weight="duotone" />
            <Text variant="caption" tone="secondary" style={styles.hintText}>
              Ukur di posisi yang sama setiap kali — pagi hari, sebelum makan, dengan pita yang pas
              tapi tidak menekan.
            </Text>
          </View>
        </Card>

        {latest.isPending ? (
          <Loading />
        ) : (
          <>
            {MEASUREMENT_PARTS.map((bagian) => (
              <Input
                key={bagian.key}
                label={bagian.label}
                value={nilai[bagian.key] ?? ''}
                onChangeText={(teks) => ubah(bagian.key, teks)}
                placeholder={
                  latest.data?.[bagian.key]
                    ? 'Terakhir ' + toNum(latest.data[bagian.key])?.toFixed(1)
                    : 'Kosongkan kalau tidak diukur'
                }
                keyboardType="decimal-pad"
                suffix="cm"
              />
            ))}

            {error ? <ErrorNote message={error} /> : null}

            <Button
              label={sudahHariIni ? 'Perbarui ukuran' : 'Simpan ukuran'}
              onPress={simpan}
              loading={saveMeasurement.isPending}
              size="lg"
            />

            {latest.data ? (
              <>
                <SectionHeader title="Pengukuran terakhir" />
                <Card>
                  <View>
                    <Text variant="caption" tone="tertiary">
                      {longDate(latest.data.logged_at)}
                    </Text>

                    {MEASUREMENT_PARTS.map((bagian) => {
                      const angka = toNum(latest.data?.[bagian.key]);
                      if (angka === null) return null;

                      return (
                        <Row
                          key={bagian.key}
                          label={bagian.label}
                          value={angka.toFixed(1) + ' cm'}
                        />
                      );
                    })}
                  </View>
                </Card>
              </>
            ) : null}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  hint: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  hintText: { flex: 1 },
});
