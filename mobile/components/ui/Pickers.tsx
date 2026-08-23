import * as Haptics from 'expo-haptics';
import { MinusIcon, PlusIcon } from 'phosphor-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { fonts, radius, spacing, typography } from '@/constants/theme';
import { dayLabel, isToday, shiftDays, todayWIB } from '@/utils/date';
import { clamp } from '@/utils/format';
import { Text } from './Text';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  decimals?: number;
}

/**
 * Pengatur angka dengan tombol tambah dan kurang.
 *
 * Untuk nilai seperti berat badan, mengetik lewat papan ketik berarti user
 * harus menutup keyboard sebelum menekan simpan. Tombol tambah-kurang membuat
 * penyesuaian kecil — naik 0,1 kg dari kemarin — jadi satu sentuhan saja.
 */
export const Stepper = ({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999999,
  suffix,
  decimals = 0,
}: StepperProps) => {
  const geser = (arah: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Dibulatkan ke jumlah desimal yang ditampilkan. Tanpa ini, penjumlahan
    // pecahan biner menghasilkan nilai seperti 82.30000000000001.
    const baru = clamp(Number((value + arah * step).toFixed(decimals + 2)), min, max);
    onChange(Number(baru.toFixed(decimals)));
  };

  return (
    <View style={styles.stepper}>
      <Pressable
        onPress={() => geser(-1)}
        disabled={value <= min}
        style={({ pressed }) => [
          styles.stepButton,
          value <= min && styles.stepDisabled,
          pressed && styles.pressed,
        ]}
        accessibilityLabel="Kurangi"
      >
        <MinusIcon size={20} color={colors.textPrimary} weight="bold" />
      </Pressable>

      <View style={styles.stepValue}>
        <Text style={typography.metric}>{value.toFixed(decimals)}</Text>
        {suffix ? (
          <Text variant="label" tone="secondary">
            {suffix}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => geser(1)}
        disabled={value >= max}
        style={({ pressed }) => [
          styles.stepButton,
          value >= max && styles.stepDisabled,
          pressed && styles.pressed,
        ]}
        accessibilityLabel="Tambah"
      >
        <PlusIcon size={20} color={colors.textPrimary} weight="bold" />
      </Pressable>
    </View>
  );
};

interface DateStripProps {
  value: string;
  onChange: (date: string) => void;
  /** Berapa hari ke belakang yang bisa dipilih. */
  days?: number;
}

/**
 * Pemilih tanggal mendatar untuk beberapa hari terakhir.
 *
 * Tanggal masa depan sengaja tidak ditawarkan — mencatat berat badan besok
 * tidak masuk akal, dan backend akan menolaknya.
 */
export const DateStrip = ({ value, onChange, days = 14 }: DateStripProps) => {
  const scroll = useRef<ScrollView>(null);

  const hariIni = todayWIB();
  const daftar = Array.from({ length: days }, (_, i) => shiftDays(hariIni, -(days - 1 - i)));

  // Digulir ke ujung kanan saat pertama tampil supaya hari ini yang terlihat.
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {daftar.map((tanggal) => {
        const aktif = tanggal === value;

        return (
          <Pressable
            key={tanggal}
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(tanggal);
            }}
            style={[styles.day, aktif ? styles.dayActive : styles.dayIdle]}
            accessibilityState={{ selected: aktif }}
          >
            <Text variant="caption" tone={aktif ? 'inverse' : 'tertiary'}>
              {isToday(tanggal) ? 'Hari ini' : dayLabel(tanggal)}
            </Text>
            <Text style={[styles.dayNumber, { color: aktif ? colors.white : colors.textPrimary }]}>
              {Number(tanggal.slice(8, 10))}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
  },
  stepButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  stepDisabled: { opacity: 0.35 },
  stepValue: { flex: 1, alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.95 }] },
  strip: { gap: spacing.sm, paddingRight: spacing.lg },
  day: {
    width: 62,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: 4,
  },
  dayActive: { backgroundColor: colors.primary },
  dayIdle: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  dayNumber: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 22 },
});
