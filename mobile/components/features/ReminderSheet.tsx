import { ClockIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorNote, Sheet, Stepper, Text, TimeField } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useUpdateNotificationSettings } from '@/services/misc.service';
import type { NotificationSettings } from '@/types';

/** Pengingat mana yang sedang diatur. */
export type ReminderKind = 'weight' | 'workout' | 'photo' | 'water';

const JUDUL: Record<ReminderKind, string> = {
  weight: 'Pengingat timbang',
  workout: 'Pengingat olahraga',
  photo: 'Pengingat foto badan',
  water: 'Pengingat minum',
};

const FIELD_JAM: Record<Exclude<ReminderKind, 'water'>, keyof NotificationSettings> = {
  weight: 'weight_reminder_time',
  workout: 'workout_reminder_time',
  photo: 'photo_reminder_time',
};

interface ReminderSheetProps {
  kind: ReminderKind;
  settings: NotificationSettings;
  onClose: () => void;
}

/**
 * Mengatur kapan satu pengingat berbunyi.
 *
 * Minum diatur sebagai jarak antar pengingat, bukan jam tetap — tidak ada yang
 * mau menentukan tujuh jam minum satu per satu. Sisanya jam tetap harian.
 */
export const ReminderSheet = ({ kind, settings, onClose }: ReminderSheetProps) => {
  const update = useUpdateNotificationSettings();

  const [jam, setJam] = useState(() =>
    kind === 'water' ? '' : ((settings[FIELD_JAM[kind]] as string | undefined) ?? '07:00'),
  );
  const [jarak, setJarak] = useState(settings.water_reminder_interval_hours);
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    const body =
      kind === 'water' ? { water_reminder_interval_hours: jarak } : { [FIELD_JAM[kind]]: jam };

    update.mutate(body, {
      onSuccess: onClose,
      onError: (e) => setError(toApiError(e).message),
    });
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={JUDUL[kind]}
      footer={<Button label="Simpan" onPress={simpan} loading={update.isPending} size="lg" />}
    >
      {kind === 'water' ? (
        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Diingatkan setiap
          </Text>
          <Stepper value={jarak} onChange={setJarak} step={1} min={1} max={12} suffix="jam" />
          <Text variant="caption" tone="tertiary">
            Pengingat hanya berbunyi antara jam 07.00 dan 21.00 supaya tidak membangunkan kamu dini
            hari.
          </Text>
        </View>
      ) : (
        <View style={styles.group}>
          <TimeField
            label="Jam pengingat"
            value={jam}
            onChange={setJam}
            icon={<ClockIcon size={16} color={colors.textSecondary} weight="duotone" />}
          />
          <Text variant="caption" tone="tertiary">
            Jam mengikuti WIB, sama seperti pengelompokan data harian.
          </Text>
        </View>
      )}

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  group: { gap: spacing.md },
});
