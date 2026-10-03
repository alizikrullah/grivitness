import { MoonStarsIcon, SunHorizonIcon } from 'phosphor-react-native';
import { LogActions } from '@/components/features/LogActions';
import { SleepEditSheet } from '@/components/features/SleepEditSheet';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Header,
  Input,
  Loading,
  Screen,
  ScoreSelector,
  TimeField,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { SCORE_LABEL } from '@/constants/labels';
import { spacing, typography } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useCreateSleep, useDeleteSleep, useSleepDate } from '@/services/sleep.service';
import type { SleepLog } from '@/types';
import {
  dayPhrase,
  isFutureTime,
  mightMeanTonight,
  sleepDayNow,
  sleepRange,
  timeWIB,
  todayWIB,
} from '@/utils/date';
import { duration } from '@/utils/format';

const FORMAT_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function SleepScreen() {
  /**
   * Tanggal yang sedang dilihat: "tidur untuk pagi hari itu". Jam mulai 18:00
   * ke atas berarti malam sebelumnya, di bawahnya tanggal itu sendiri
   * (sleepRange di utils/date, sama dengan sleepDay() di backend). Satu malam
   * yang terpotong, misalnya 21:00 sampai 23:00 lalu 02:00 sampai 04:20,
   * dicatat dua kali di tanggal yang SAMA.
   */
  const [tanggal, setTanggal] = useState(todayWIB());

  const today = useSleepDate(tanggal);
  const createSleep = useCreateSleep();
  const deleteSleep = useDeleteSleep();

  const [mulai, setMulai] = useState('23:00');
  const [bangun, setBangun] = useState('06:30');
  const [kualitas, setKualitas] = useState<number | null>(4);
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<SleepLog | null>(null);

  const jamValid = FORMAT_JAM.test(mulai) && FORMAT_JAM.test(bangun);

  // Dihitung terhadap tanggal yang sedang dilihat, bukan terhadap hari ini.
  // Tanpa itu, tidur yang dicatat sambil menelusuri hari lampau tetap jatuh
  // ke hari ini dan tanggal yang sedang dibuka tetap terlihat kosong.
  const rentang = jamValid ? sleepRange(tanggal, mulai, bangun) : null;

  const menit = rentang
    ? Math.round((new Date(rentang.end).getTime() - new Date(rentang.start).getTime()) / 60_000)
    : 0;

  /** Jam bangun yang belum terjadi hampir pasti tanggal yang salah. */
  const belumTerjadi = rentang !== null && isFutureTime(rentang.end);

  /** Jam 18:00 ke atas di hari ini bisa juga berarti hari ini sendiri, lihat mightMeanTonight. */
  const mungkinSoreIni = rentang !== null && mightMeanTonight(tanggal, mulai, bangun);

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

    if (rentang === null || menit <= 0 || menit > 24 * 60) {
      setError('Durasi tidur tidak masuk akal. Periksa lagi jamnya.');
      return;
    }

    if (belumTerjadi) {
      setError('Jam bangun itu belum terjadi. Cek lagi tanggal dan jamnya.');
      return;
    }

    createSleep.mutate(
      {
        sleep_start: rentang.start,
        sleep_end: rentang.end,
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
    <>
      <Screen>
        <Header title="Tidur" subtitle="Boleh lebih dari satu sesi, termasuk tidur siang" />

        <DateNav value={tanggal} onChange={setTanggal} section="sleep" maxDate={sleepDayNow()} />

        <Card>
          <View style={styles.card}>
            <View style={styles.times}>
              <View style={styles.timeField}>
                <TimeField
                  label="Mulai tidur"
                  value={mulai}
                  onChange={setMulai}
                  icon={<MoonStarsIcon size={16} color={metricColors.sleep} weight="duotone" />}
                />
              </View>

              <View style={styles.timeField}>
                <TimeField
                  label="Bangun"
                  value={bangun}
                  onChange={setBangun}
                  icon={<SunHorizonIcon size={16} color={colors.warning} weight="duotone" />}
                />
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
                {menit > 0 ? duration(menit) : '-'}
              </Text>
              {/*
                Keterangan cuma muncul kalau ada yang perlu dibetulkan. Rentang
                lengkap di bawah setiap isian sempat dipasang dan terasa
                mengganggu; untuk isian biasa tanggalnya memang sudah benar.
              */}
              {belumTerjadi ? (
                <Text variant="caption" tone="warning" align="center">
                  Jam bangun ini belum terjadi, cek tanggalnya.
                </Text>
              ) : mungkinSoreIni ? (
                <Text variant="caption" tone="secondary" align="center">
                  Ini masuk malam kemarin. Kalau maksudnya malam ini, geser tanggal ke besok.
                </Text>
              ) : null}
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

        <SectionHeader
          title={'Tidur ' + dayPhrase(tanggal)}
          action={
            <Text variant="caption" tone="tertiary">
              total {duration(today.data?.total_minutes ?? 0)}
            </Text>
          }
        />

        {today.isPending ? (
          <Loading />
        ) : (today.data?.logs.length ?? 0) === 0 ? (
          <EmptyState
            icon={<MoonStarsIcon size={30} color={colors.textTertiary} weight="duotone" />}
            title="Belum ada catatan tidur"
            message="Isi jam tidur dan bangun di atas."
          />
        ) : (
          today.data?.logs.map((log) => (
            <Card key={log.id} padding="md">
              <View style={styles.logRow}>
                <View style={styles.logText}>
                  <Text variant="label">{duration(log.duration_minutes)}</Text>
                  <Text variant="caption" tone="secondary">
                    {timeWIB(log.sleep_start)} - {timeWIB(log.sleep_end)} ·{' '}
                    {SCORE_LABEL.sleep[log.quality_score]}
                  </Text>
                  {log.notes ? (
                    <Text variant="caption" tone="tertiary">
                      {log.notes}
                    </Text>
                  ) : null}
                </View>

                <LogActions
                  onEdit={() => setDiedit(log)}
                  onDelete={() => deleteSleep.mutate(log.id)}
                  deleteMessage="Catatan tidur ini akan dihapus permanen."
                />
              </View>
            </Card>
          ))
        )}
      </Screen>

      {diedit ? (
        <SleepEditSheet key={diedit.id} log={diedit} onClose={() => setDiedit(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xl },
  times: { flexDirection: 'row', gap: spacing.md },
  timeField: { flex: 1, gap: spacing.sm },
  durationBox: { alignItems: 'center', gap: spacing.xs },
  quality: { gap: spacing.md },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logText: { flex: 1, gap: 2 },
});
