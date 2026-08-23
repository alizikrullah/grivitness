import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ChipGroup, ErrorNote, Input, Sheet, Stepper, Text } from '@/components/ui';
import { INTENSITY_LABEL, INTENSITY_OPTIONS } from '@/constants/labels';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useUpdateWorkout } from '@/services/workouts.service';
import type { WorkoutIntensity, WorkoutLog } from '@/types';

interface WorkoutEditSheetProps {
  log: WorkoutLog;
  onClose: () => void;
}

/**
 * Mengoreksi sesi olahraga.
 *
 * Kalorinya sengaja tidak ikut disunting di sini. Backend menskalakannya ulang
 * secara proporsional begitu durasinya berubah, dan menawarkan dua kolom yang
 * saling memengaruhi hanya membuat user bertanya-tanya mana yang menang.
 */
export const WorkoutEditSheet = ({ log, onClose }: WorkoutEditSheetProps) => {
  const update = useUpdateWorkout();

  const [durasi, setDurasi] = useState(log.duration_minutes);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>(log.intensity);
  const [catatan, setCatatan] = useState(log.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    if (durasi < 1) {
      setError('Durasi minimal 1 menit');
      return;
    }

    setError(null);

    update.mutate(
      {
        id: log.id,
        duration_minutes: durasi,
        intensity: intensitas,
        notes: catatan.trim() === '' ? null : catatan.trim(),
      },
      { onSuccess: onClose, onError: (e) => setError(toApiError(e).message) },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={log.workout_name}
      footer={
        <Button label="Simpan perubahan" onPress={simpan} loading={update.isPending} size="lg" />
      }
    >
      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Durasi
        </Text>
        <Stepper value={durasi} onChange={setDurasi} step={5} min={1} max={1440} suffix="menit" />
        <Text variant="caption" tone="tertiary">
          Kalori dihitung ulang otomatis mengikuti durasi.
        </Text>
      </View>

      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Intensitas
        </Text>
        <ChipGroup
          options={INTENSITY_OPTIONS}
          value={intensitas}
          onChange={setIntensitas}
          labels={INTENSITY_LABEL}
          wrap
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
  group: { gap: spacing.md },
});
