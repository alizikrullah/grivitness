import * as Haptics from 'expo-haptics';
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Calendar, IconCircle, Sheet, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { useCalendarDays } from '@/services/misc.service';
import type { CalendarSection } from '@/types';
import { monthEnd, monthStart, navDateLabel, shiftDays, todayWIB } from '@/utils/date';

/** Apa yang ditandai titik hijau di tiap layar, untuk keterangan di bawah kalender. */
const ISI: Record<CalendarSection, string> = {
  food: 'catatan makan',
  water: 'catatan minum',
  workout: 'catatan olahraga',
  steps: 'catatan langkah',
  sleep: 'catatan tidur',
  weight: 'catatan berat',
  mood: 'catatan mood',
  'body-photo': 'foto badan atau lingkar pinggang',
  'device-energy': 'angka jam tangan',
};

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
  const hariIni = todayWIB();
  const batas = maxDate ?? hariIni;
  const [buka, setBuka] = useState(false);
  const [bulan, setBulan] = useState(monthStart(value));

  const tanda = useCalendarDays(section, monthStart(bulan), monthEnd(bulan), buka);
  const kuning = new Set(tanda.data?.incomplete ?? []);
  const hijau = new Set((tanda.data?.dates ?? []).filter((t) => !kuning.has(t)));

  const bisaMaju = value < batas;

  const geser = (hari: number) => {
    void Haptics.selectionAsync();
    onChange(shiftDays(value, hari));
  };

  const pilih = (tanggal: string) => {
    onChange(tanggal);
    setBuka(false);
  };

  return (
    <>
      <View style={styles.box}>
        <IconCircle size={40} onPress={() => geser(-1)}>
          <CaretLeftIcon size={18} color={colors.textPrimary} weight="bold" />
        </IconCircle>

        <Pressable
          onPress={() => {
            setBulan(monthStart(value));
            setBuka(true);
          }}
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

      <Sheet visible={buka} onClose={() => setBuka(false)} title="Pilih tanggal">
        <Calendar
          month={bulan}
          selected={value}
          maxDate={batas}
          marked={hijau}
          warned={kuning}
          onSelect={pilih}
          onMonthChange={setBulan}
        />

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.success }]} />
            <Text variant="caption" tone="secondary">
              Ada {ISI[section]}
            </Text>
          </View>
          {section === 'food' ? (
            <View style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: colors.warning }]} />
              <Text variant="caption" tone="secondary">
                Ditandai belum lengkap
              </Text>
            </View>
          ) : null}
        </View>

        {value === hariIni ? null : (
          <Button label="Kembali ke hari ini" variant="secondary" onPress={() => pilih(hariIni)} />
        )}
      </Sheet>
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
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
