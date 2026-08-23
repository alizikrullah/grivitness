import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarBlankIcon, ClockIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { longDate, toWIBDate } from '@/utils/date';
import { Text } from './Text';

interface DateFieldProps {
  label: string;
  /** Tanggal YYYY-MM-DD. String kosong berarti user belum memilih. */
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Tanggal yang dibuka pertama kali saat value masih kosong. */
  defaultDate?: Date;
  placeholder?: string;
}

const parse = (value: string, fallback: Date): Date => {
  if (value === '') return fallback;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? fallback : d;
};

/**
 * Pemilih tanggal yang membuka kalender bawaan sistem.
 *
 * Sebelumnya tanggal diketik sebagai "YYYY-MM-DD" di kolom teks biasa. Itu
 * berjalan, tapi meminta orang mengetik tanggal lahirnya dengan format persis
 * di layar sentuh adalah cara tercepat membuat mereka salah isi — dan salah
 * satu digit pada tahun lahir langsung menggeser perhitungan BMR.
 */
export const DateField = ({
  label,
  value,
  onChange,
  hint,
  minimumDate,
  maximumDate,
  defaultDate,
  placeholder = 'Pilih tanggal',
}: DateFieldProps) => {
  const [buka, setBuka] = useState(false);
  const kosong = value === '';

  const pilih = (event: DateTimePickerEvent, dipilih?: Date) => {
    // Android menutup dialognya sendiri; iOS menampilkannya menempel sehingga
    // harus ditutup manual setelah user selesai.
    if (Platform.OS === 'android') setBuka(false);

    if (event.type === 'dismissed' || !dipilih) return;

    onChange(toWIBDate(dipilih));
  };

  return (
    <View style={styles.wrapper}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>

      <Pressable
        onPress={() => setBuka(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <CalendarBlankIcon size={20} color={colors.textSecondary} weight="duotone" />
        <Text variant="bodyMedium" tone={kosong ? 'tertiary' : 'primary'} style={styles.value}>
          {kosong ? placeholder : longDate(value)}
        </Text>
      </Pressable>

      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}

      {buka ? (
        <>
          <DateTimePicker
            value={parse(value, defaultDate ?? maximumDate ?? new Date())}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={pilih}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            themeVariant="dark"
          />

          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setBuka(false)} style={styles.done}>
              <Text variant="label" tone="accent">
                Selesai
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
};

interface TimeFieldProps {
  label: string;
  /** Jam "HH:mm" dalam WIB. */
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
}

/** Pemilih jam untuk waktu tidur dan bangun. */
export const TimeField = ({ label, value, onChange, icon }: TimeFieldProps) => {
  const [buka, setBuka] = useState(false);

  const awal = (() => {
    const d = new Date();
    d.setHours(Number(value.slice(0, 2)), Number(value.slice(3, 5)), 0, 0);
    return d;
  })();

  const pilih = (event: DateTimePickerEvent, dipilih?: Date) => {
    if (Platform.OS === 'android') setBuka(false);
    if (event.type === 'dismissed' || !dipilih) return;

    const jam = String(dipilih.getHours()).padStart(2, '0');
    const menit = String(dipilih.getMinutes()).padStart(2, '0');
    onChange(jam + ':' + menit);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.timeLabel}>
        {icon}
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      </View>

      <Pressable
        onPress={() => setBuka(true)}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <ClockIcon size={18} color={colors.textSecondary} weight="duotone" />
        <Text variant="h3" style={styles.value}>
          {value}
        </Text>
      </Pressable>

      {buka ? (
        <>
          <DateTimePicker
            value={awal}
            mode="time"
            is24Hour
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={pilih}
            themeVariant="dark"
          />

          {Platform.OS === 'ios' ? (
            <Pressable onPress={() => setBuka(false)} style={styles.done}>
              <Text variant="label" tone="accent">
                Selesai
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { flex: 1 },
  pressed: { opacity: 0.75, borderColor: colors.borderFocus },
  timeLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  done: { alignSelf: 'flex-end', padding: spacing.md },
});
