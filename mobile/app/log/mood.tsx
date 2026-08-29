import { useRouter } from 'expo-router';
import { LogActions } from '@/components/features/LogActions';
import { BatteryChargingIcon, SmileyIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BarChart,
  Button,
  Card,
  DateStrip,
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
import { useDeleteMood, useMoodDate, useMoodRange, useSaveMood } from '@/services/mood.service';
import { dateRange, dayLabel, dayPhrase, shiftDays, todayWIB } from '@/utils/date';

export default function MoodScreen() {
  const router = useRouter();

  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [dipilih, setDipilih] = useState(todayWIB());

  // Chart tetap berlabuh pada hari ini apa pun tanggal yang sedang dibuka.
  const hariIni = todayWIB();
  const awal = shiftDays(hariIni, -6);

  const today = useMoodDate(dipilih);
  const riwayat = useMoodRange(awal, hariIni);
  const saveMood = useSaveMood();
  const deleteMood = useDeleteMood();

  const logHariIni = today.data ?? null;

  const [mood, setMood] = useState<number | null>(null);
  const [energi, setEnergi] = useState<number | null>(null);
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [terisi, setTerisi] = useState(false);

  /**
   * Isian dikosongkan saat pindah tanggal, disetel ulang saat render dan bukan
   * lewat useEffect. Tanpa ini, mood hari kemarin terisi dengan mood hari ini
   * yang barusan dilihat, dan menyimpannya menulis nilai salah ke hari salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(dipilih);
  if (dipilih !== tanggalTerakhir) {
    setTanggalTerakhir(dipilih);
    setMood(null);
    setEnergi(null);
    setCatatan('');
    setError(null);
    setTerisi(false);
  }

  // Kalau tanggal itu sudah dicatat, form dibuka dengan nilai yang tersimpan
  // agar user menyunting, bukan mengisi ulang dari nol.
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
      // null, bukan nol. Hari yang tidak dicatat bukan berarti mood terburuk.
      value: log?.mood_score ?? null,
      caption: log ? log.mood_score + '/5' : undefined,
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
        // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
        logged_at: dipilih,
      },
      {
        onSuccess: () => router.back(),
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Screen>
      <Header
        title="Mood & energi"
        subtitle={today.data ? 'Sudah dicatat ' + dayPhrase(dipilih) : 'Satu catatan per hari'}
        action={
          logHariIni ? (
            <LogActions
              row
              onDelete={() =>
                deleteMood.mutate(logHariIni.id, {
                  // Form dibuka ulang sebagai kosong setelah dihapus. Tanpa ini,
                  // nilai yang barusan dihapus masih terpampang di layar.
                  onSuccess: () => {
                    setMood(null);
                    setEnergi(null);
                    setCatatan('');
                    setTerisi(false);
                  },
                })
              }
              deleteMessage={'Catatan mood ' + dayPhrase(dipilih) + ' akan dihapus.'}
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
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.lg },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
