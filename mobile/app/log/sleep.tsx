import { MoonStarsIcon, SunHorizonIcon, TrashIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Header,
  IconCircle,
  Input,
  Loading,
  Screen,
  ScoreSelector,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { SCORE_LABEL } from '@/constants/labels';
import { spacing, typography } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useCreateSleep, useDeleteSleep, useSleepToday } from '@/services/sleep.service';
import { shiftDays, timeWIB, todayWIB, wibToISO } from '@/utils/date';
import { duration } from '@/utils/format';

const FORMAT_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SleepScreen() {
  const today = useSleepToday();
  const createSleep = useCreateSleep();
  const deleteSleep = useDeleteSleep();

  const [mulai, setMulai] = useState('23:00');
  const [bangun, setBangun] = useState('06:30');
  const [kualitas, setKualitas] = useState<number | null>(4);
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);

  const jamValid = FORMAT_JAM.test(mulai) && FORMAT_JAM.test(bangun);

  /**
   * Tidur hampir selalu melewati tengah malam, jadi jam bangun yang lebih kecil
   * dari jam tidur berarti keesokan harinya — bukan durasi negatif.
   */
  const hitungRentang = () => {
    const hariIni = todayWIB();
    const tidurMalamSebelumnya = mulai >= bangun;

    const tanggalMulai = tidurMalamSebelumnya ? shiftDays(hariIni, -1) : hariIni;

    return {
      start: wibToISO(tanggalMulai, mulai),
      end: wibToISO(hariIni, bangun),
    };
  };

  const menit = (() => {
    if (!jamValid) return 0;
    const { start, end } = hitungRentang();
    return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
  })();

  const simpan = () => {
    setError(null);

    if (!jamValid) {
      setError('Jam harus berformat HH:mm, contoh 23:00');
      return;
    }

    if (kualitas === null) {
      setError('Pilih kualitas tidur');
      return;
    }

    if (menit <= 0 || menit > 24 * 60) {
      setError('Durasi tidur tidak masuk akal. Periksa lagi jamnya.');
      return;
    }

    const { start, end } = hitungRentang();

    createSleep.mutate(
      {
        sleep_start: start,
        sleep_end: end,
        quality_score: kualitas,
        notes: catatan.trim() === '' ? undefined : catatan.trim(),
      },
      {
        onSuccess: () => setCatatan(''),
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
        <Header title="Tidur" subtitle="Boleh lebih dari satu sesi, termasuk tidur siang" />

        <Card>
          <View style={styles.card}>
            <View style={styles.times}>
              <View style={styles.timeField}>
                <View style={styles.timeLabel}>
                  <MoonStarsIcon size={16} color={metricColors.sleep} weight="duotone" />
                  <Text variant="caption" tone="secondary">
                    Mulai tidur
                  </Text>
                </View>
                <Input value={mulai} onChangeText={setMulai} placeholder="23:00" />
              </View>

              <View style={styles.timeField}>
                <View style={styles.timeLabel}>
                  <SunHorizonIcon size={16} color={colors.warning} weight="duotone" />
                  <Text variant="caption" tone="secondary">
                    Bangun
                  </Text>
                </View>
                <Input value={bangun} onChangeText={setBangun} placeholder="06:30" />
              </View>
            </View>

            <View style={styles.durationBox}>
              <Text variant="overline" tone="tertiary">
                Durasi
              </Text>
              <Text
                style={typography.metric}
                color={menit > 0 ? colors.textPrimary : colors.textTertiary}
              >
                {menit > 0 ? duration(menit) : '—'}
              </Text>
            </View>

            <View style={styles.quality}>
              <Text variant="label" tone="secondary">
                Kualitas tidur
              </Text>
              <ScoreSelector
                value={kualitas}
                onChange={setKualitas}
                kind="sleep"
                color={metricColors.sleep}
              />
            </View>
          </View>
        </Card>

        <Input
          label="Catatan"
          value={catatan}
          onChangeText={setCatatan}
          placeholder="Opsional. Misalnya: kebangun dua kali"
          multiline
          maxLength={1000}
          autoCapitalize="sentences"
        />

        {error ? <ErrorNote message={error} /> : null}

        <Button label="Simpan tidur" onPress={simpan} loading={createSleep.isPending} size="lg" />

        <SectionHeader title="Tidur hari ini" />

        {today.isPending ? (
          <Loading />
        ) : (today.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<MoonStarsIcon size={30} color={colors.textTertiary} weight="duotone" />}
            title="Belum ada catatan tidur"
            message="Isi jam tidur dan bangun di atas."
          />
        ) : (
          today.data?.map((log) => (
            <Card key={log.id} padding="md">
              <View style={styles.logRow}>
                <View style={styles.logText}>
                  <Text variant="label">{duration(log.duration_minutes)}</Text>
                  <Text variant="caption" tone="secondary">
                    {timeWIB(log.sleep_start)} – {timeWIB(log.sleep_end)} ·{' '}
                    {SCORE_LABEL.sleep[log.quality_score]}
                  </Text>
                  {log.notes ? (
                    <Text variant="caption" tone="tertiary">
                      {log.notes}
                    </Text>
                  ) : null}
                </View>

                <IconCircle size={36} onPress={() => deleteSleep.mutate(log.id)}>
                  <TrashIcon size={16} color={colors.textSecondary} weight="regular" />
                </IconCircle>
              </View>
            </Card>
          ))
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  card: { gap: spacing.xl },
  times: { flexDirection: 'row', gap: spacing.md },
  timeField: { flex: 1, gap: spacing.sm },
  timeLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  durationBox: { alignItems: 'center', gap: spacing.xs },
  quality: { gap: spacing.md },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logText: { flex: 1, gap: 2 },
});
