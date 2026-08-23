import { useRouter } from 'expo-router';
import { BatteryChargingIcon, SmileyIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  BarChart,
  Button,
  Card,
  ErrorNote,
  Header,
  Input,
  Loading,
  Screen,
  ScoreSelector,
  SectionHeader,
  Text,
  type BarDatum,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useMoodRange, useMoodToday, useSaveMood } from '@/services/mood.service';
import { dateRange, dayLabel, shiftDays, todayWIB } from '@/utils/date';

export default function MoodScreen() {
  const router = useRouter();

  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -6);

  const today = useMoodToday();
  const riwayat = useMoodRange(awal, hariIni);
  const saveMood = useSaveMood();

  const [mood, setMood] = useState<number | null>(null);
  const [energi, setEnergi] = useState<number | null>(null);
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [terisi, setTerisi] = useState(false);

  // Kalau hari ini sudah dicatat, form dibuka dengan nilai yang tersimpan agar
  // user menyunting, bukan mengisi ulang dari nol.
  if (!terisi && today.data) {
    setMood(today.data.mood_score);
    setEnergi(today.data.energy_score);
    setCatatan(today.data.notes ?? '');
    setTerisi(true);
  }

  const batang: BarDatum[] = dateRange(awal, hariIni).map((tanggal) => {
    const log = riwayat.data?.find((l) => l.logged_at === tanggal);
    return {
      label: dayLabel(tanggal),
      value: log?.mood_score ?? 0,
      caption: log ? log.mood_score + '/5' : '—',
    };
  });

  const simpan = () => {
    setError(null);

    if (mood === null || energi === null) {
      setError('Pilih skor mood dan energi');
      return;
    }

    saveMood.mutate(
      {
        id: today.data?.id,
        mood_score: mood,
        energy_score: energi,
        notes: catatan.trim() === '' ? undefined : catatan.trim(),
      },
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
          title="Mood & energi"
          subtitle={today.data ? 'Sudah dicatat hari ini' : 'Satu catatan per hari'}
        />

        {today.isPending ? (
          <Loading />
        ) : (
          <>
            <Card>
              <View style={styles.block}>
                <View style={styles.blockHead}>
                  <SmileyIcon size={20} color={metricColors.mood} weight="duotone" />
                  <Text variant="label">Bagaimana perasaan kamu?</Text>
                </View>
                <ScoreSelector
                  value={mood}
                  onChange={setMood}
                  kind="mood"
                  color={metricColors.mood}
                />
              </View>
            </Card>

            <Card>
              <View style={styles.block}>
                <View style={styles.blockHead}>
                  <BatteryChargingIcon size={20} color={colors.success} weight="duotone" />
                  <Text variant="label">Seberapa berenergi?</Text>
                </View>
                <ScoreSelector
                  value={energi}
                  onChange={setEnergi}
                  kind="energy"
                  color={colors.success}
                />
              </View>
            </Card>

            <Input
              label="Catatan"
              value={catatan}
              onChangeText={setCatatan}
              placeholder="Opsional. Apa yang memengaruhi mood kamu hari ini?"
              multiline
              maxLength={1000}
              autoCapitalize="sentences"
            />

            {error ? <ErrorNote message={error} /> : null}

            <Button
              label={today.data ? 'Perbarui catatan' : 'Simpan catatan'}
              onPress={simpan}
              loading={saveMood.isPending}
              size="lg"
            />

            <SectionHeader title="Mood 7 hari terakhir" />
            <Card>
              <BarChart data={batang} color={metricColors.mood} height={110} />
            </Card>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  block: { gap: spacing.lg },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
