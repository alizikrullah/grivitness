import { MoonStarsIcon, SunHorizonIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorNote, Input, ScoreSelector, Sheet, Text, TimeField } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { spacing, typography } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useUpdateSleep } from '@/services/sleep.service';
import type { SleepLog } from '@/types';
import { isFutureTime, sleepRange, timeWIB } from '@/utils/date';
import { duration } from '@/utils/format';

interface SleepEditSheetProps {
  log: SleepLog;
  onClose: () => void;
}

/**
 * Mengoreksi sesi tidur yang sudah tercatat.
 *
 * Tanggal acuan diambil dari tanggal tidur sesi ini (logged_at), bukan dari hari
 * ini: mengedit catatan kemarin tidak boleh diam-diam memindahkannya ke hari ini.
 * Aturan jamnya sama dengan layar catat, lihat sleepRange di utils/date.
 */
export const SleepEditSheet = ({ log, onClose }: SleepEditSheetProps) => {
  const update = useUpdateSleep();

  const [mulai, setMulai] = useState(timeWIB(log.sleep_start));
  const [bangun, setBangun] = useState(timeWIB(log.sleep_end));
  const [kualitas, setKualitas] = useState<number | null>(log.quality_score);
  const [catatan, setCatatan] = useState(log.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const rentang = sleepRange(log.logged_at, mulai, bangun);

  const menit = Math.round(
    (new Date(rentang.end).getTime() - new Date(rentang.start).getTime()) / 60_000,
  );

  const belumTerjadi = isFutureTime(rentang.end);

  const simpan = () => {
    if (kualitas === null) {
      setError('Pilih kualitas tidur');
      return;
    }

    if (menit <= 0 || menit > 24 * 60) {
      setError('Durasi tidur tidak masuk akal. Periksa lagi jamnya.');
      return;
    }

    if (belumTerjadi) {
      setError('Jam bangun itu belum terjadi. Cek lagi jamnya.');
      return;
    }

    setError(null);

    update.mutate(
      {
        id: log.id,
        sleep_start: rentang.start,
        sleep_end: rentang.end,
        quality_score: kualitas,
        notes: catatan.trim() === '' ? null : catatan.trim(),
      },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Ubah catatan tidur"
      footer={
        <Button label="Simpan perubahan" onPress={simpan} loading={update.isPending} size="lg" />
      }
    >
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
        {belumTerjadi ? (
          <Text variant="caption" tone="warning" align="center">
            Jam bangun ini belum terjadi, cek jamnya.
          </Text>
        ) : null}
      </View>

      <View style={styles.group}>
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

      <Input
        label="Catatan"
        value={catatan}
        onChangeText={setCatatan}
        placeholder="Opsional"
        maxLength={1000}
        autoCapitalize="sentences"
        multiline
      />

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  times: { flexDirection: 'row', gap: spacing.md },
  timeField: { flex: 1, gap: spacing.sm },
  durationBox: { alignItems: 'center', gap: spacing.xs },
  group: { gap: spacing.md },
});
