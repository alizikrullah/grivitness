import {
  BarbellIcon,
  BedIcon,
  CaretDownIcon,
  CheckIcon,
  ThermometerSimpleIcon,
  type IconProps,
} from 'phosphor-react-native';
import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorNote, IconCircle, Sheet, Text } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { DAY_STATUS_HINT, DAY_STATUS_LABEL, DAY_STATUS_OPTIONS } from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useSetWorkoutDayStatus } from '@/services/workouts.service';
import type { SickMark, WorkoutDayStatus } from '@/types';
import { shortDate } from '@/utils/date';

type Pilihan = WorkoutDayStatus | '';

/** Wadahnya tetap gelap, warnanya cuma di ikon (section 11). Sakit oranye, bukan merah. */
const IKON: Record<Pilihan, { Icon: ComponentType<IconProps>; color: string }> = {
  '': { Icon: BarbellIcon, color: metricColors.workout },
  REST: { Icon: BedIcon, color: metricColors.sleep },
  SICK: { Icon: ThermometerSimpleIcon, color: colors.warning },
};

interface DayStatusPickerProps {
  date: string;
  value: WorkoutDayStatus | null;
  /** Rentang sakit yang memuat tanggal ini, untuk menyebut sejak kapan. */
  sick: SickMark | null;
}

/**
 * Status hari di layar olahraga: hari biasa, rest day, atau lagi sakit.
 *
 * Dulu tanda sakit berupa centang di halaman Catat, dan terlihat janggal di
 * sana. Di sini pertanyaannya memang muncul: hari ini kenapa tidak latihan.
 * Cuma tanda untuk chat dan overview; tidak ada hitungan yang berubah.
 */
export const DayStatusPicker = ({ date, value, sick }: DayStatusPickerProps) => {
  const [buka, setBuka] = useState(false);
  const ubah = useSetWorkoutDayStatus();

  // Selama permintaan berjalan, tampilkan yang baru dipilih, bukan yang lama.
  const aktif: Pilihan = (ubah.isPending ? ubah.variables?.status : value) ?? '';
  const { Icon, color } = IKON[aktif];

  const pilih = (p: Pilihan) => {
    setBuka(false);
    if (p !== aktif) ubah.mutate({ date, status: p === '' ? null : p });
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setBuka(true)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <IconCircle size={36} round={false}>
          <Icon size={18} color={color} weight="fill" />
        </IconCircle>
        <View style={styles.text}>
          <Text variant="caption" tone="tertiary">
            Status hari
          </Text>
          <Text variant="label" numberOfLines={1}>
            {DAY_STATUS_LABEL[aktif]}
          </Text>
        </View>
        <CaretDownIcon size={16} color={colors.textSecondary} weight="bold" />
      </Pressable>

      {/* Cuma saat sakit: user perlu tahu sejak kapan dan cara mengakhirinya. */}
      {aktif === 'SICK' && sick ? (
        <Text variant="caption" tone="secondary">
          {sick.end_date
            ? 'Sakit ' + shortDate(sick.start_date) + ' sampai ' + shortDate(sick.end_date) + '.'
            : 'Sakit sejak ' +
              shortDate(sick.start_date) +
              '. Pilih status lain di hari kamu sembuh.'}
        </Text>
      ) : null}

      {ubah.isError ? <ErrorNote message={toApiError(ubah.error).message} /> : null}

      <Sheet visible={buka} onClose={() => setBuka(false)} title="Status hari">
        <View style={styles.list}>
          {DAY_STATUS_OPTIONS.map((p) => {
            const ikon = IKON[p];
            return (
              <Pressable
                key={p || 'biasa'}
                onPress={() => pilih(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: p === aktif }}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
              >
                <IconCircle size={36}>
                  <ikon.Icon size={18} color={ikon.color} weight="fill" />
                </IconCircle>
                <View style={styles.text}>
                  <Text variant="bodyMedium">{DAY_STATUS_LABEL[p]}</Text>
                  {p !== '' ? (
                    <Text variant="caption" tone="tertiary">
                      {DAY_STATUS_HINT[p]}
                    </Text>
                  ) : null}
                </View>
                {p === aktif ? <CheckIcon size={18} color={colors.primary} weight="bold" /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  text: { flex: 1, gap: 2 },
  pressed: { opacity: 0.75 },
  list: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
});
