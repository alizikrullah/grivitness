import * as Haptics from 'expo-haptics';
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CalendarSheet } from '@/components/features/CalendarSheet';
import { IconCircle, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import type { CalendarSection } from '@/types';
import { navDateLabel, shiftDays, todayWIB } from '@/utils/date';

interface DateNavProps {
  value: string;
  onChange: (date: string) => void;
  /** Layar yang memakai: menentukan tanggal mana yang bertitik. */
  section: CalendarSection;
  /** Tanggal terjauh yang boleh dipilih, bawaan hari ini. Layar tidur: sleepDayNow(). */
  maxDate?: string;
}

/**
 * Kotak tanggal di layar catat: "‹ Hari ini, Sab 3 Okt ›".
 *
 * Panah pindah sehari, sama cepatnya dengan strip tanggal yang lama. Ketuk
 * tengahnya untuk kalender sebulan yang menandai hari-hari yang ADA catatannya
 * di layar ini, jadi hari yang lupa diisi kelihatan dari titiknya yang tidak
 * ada. Strip lama cuma menjangkau dua minggu dan tidak menandai apa pun.
 */
export const DateNav = ({ value, onChange, section, maxDate }: DateNavProps) => {
  const batas = maxDate ?? todayWIB();
  const [buka, setBuka] = useState(false);

  const bisaMaju = value < batas;

  const geser = (hari: number) => {
    void Haptics.selectionAsync();
    onChange(shiftDays(value, hari));
  };

  return (
    <>
      <View style={styles.box}>
        <IconCircle size={40} onPress={() => geser(-1)}>
          <CaretLeftIcon size={18} color={colors.textPrimary} weight="bold" />
        </IconCircle>

        <Pressable
          onPress={() => setBuka(true)}
          style={({ pressed }) => [styles.center, pressed && styles.pressed]}
          accessibilityLabel="Pilih tanggal dari kalender"
        >
          <CalendarBlankIcon size={18} color={colors.textSecondary} weight="duotone" />
          <Text variant="label" numberOfLines={1}>
            {navDateLabel(value)}
          </Text>
        </Pressable>

        <IconCircle
          size={40}
          onPress={bisaMaju ? () => geser(1) : undefined}
          style={bisaMaju ? undefined : styles.disabled}
        >
          <CaretRightIcon size={18} color={colors.textPrimary} weight="bold" />
        </IconCircle>
      </View>

      <CalendarSheet
        visible={buka}
        onClose={() => setBuka(false)}
        value={value}
        onSelect={(tanggal) => {
          onChange(tanggal);
          setBuka(false);
        }}
        section={section}
        maxDate={batas}
      />
    </>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
});
