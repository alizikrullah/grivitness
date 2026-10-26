import * as Haptics from 'expo-haptics';
import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { IconCircle, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { dayLabel, monthTitle, shiftDays, todayWIB, weekdayMon } from '@/utils/date';

interface WeekStripProps {
  value: string;
  onChange: (date: string) => void;
  onOpenCalendar: () => void;
  /** Hari yang catatan hariannya lengkap: titik hijau. */
  complete: Set<string>;
  /** Hari yang ada catatannya tapi belum lengkap: titik kuning. */
  partial: Set<string>;
}

/** Geseran jari mendatar sejauh ini dihitung sebagai pindah pekan. */
const AMBANG_GESER = 40;

/**
 * Strip sepekan (Senin sampai Minggu) di header halaman Catat.
 *
 * Tiap hari bertitik: hijau kalau catatan hariannya lengkap, kuning kalau baru
 * sebagian, kosong kalau tidak ada catatan sama sekali. Jadi hari yang
 * terlewat karena sibuk atau sakit kelihatan tanpa membuka harinya satu per
 * satu. Digeser ke kiri atau kanan untuk pindah pekan, panah melakukan hal
 * yang sama, dan judul bulannya membuka kalender sebulan.
 *
 * Hari terpilih memakai pil terang, bukan merah: merah di layar ini sudah
 * dipakai sorotan judul dan tab bar.
 */
export const WeekStrip = ({
  value,
  onChange,
  onOpenCalendar,
  complete,
  partial,
}: WeekStripProps) => {
  const hariIni = todayWIB();
  const senin = shiftDays(value, -weekdayMon(value));
  const hari = Array.from({ length: 7 }, (_, i) => shiftDays(senin, i));
  const bisaMaju = shiftDays(senin, 7) <= hariIni;

  // Pindah pekan memindah tanggal terpilih ke hari yang sama pekan itu,
  // ditahan di hari ini supaya tidak pernah memilih hari yang belum terjadi.
  const pindahPekan = (arah: number) => {
    if (arah > 0 && !bisaMaju) return;
    void Haptics.selectionAsync();
    const tujuan = shiftDays(value, arah * 7);
    onChange(tujuan > hariIni ? hariIni : tujuan);
  };

  // Dibuat ulang tiap render supaya selalu memakai tanggal terbaru. Murah:
  // cuma objek berisi beberapa fungsi.
  const geser = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderRelease: (_, g) => {
      if (g.dx <= -AMBANG_GESER) pindahPekan(1);
      else if (g.dx >= AMBANG_GESER) pindahPekan(-1);
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <IconCircle size={36} onPress={() => pindahPekan(-1)}>
          <CaretLeftIcon size={16} color={colors.textPrimary} weight="bold" />
        </IconCircle>

        <Pressable
          onPress={onOpenCalendar}
          style={({ pressed }) => [styles.title, pressed && styles.pressed]}
          accessibilityLabel="Buka kalender sebulan"
        >
          <CalendarBlankIcon size={16} color={colors.textSecondary} weight="duotone" />
          <Text variant="label">{monthTitle(value)}</Text>
        </Pressable>

        <IconCircle
          size={36}
          onPress={bisaMaju ? () => pindahPekan(1) : undefined}
          style={bisaMaju ? undefined : styles.disabled}
        >
          <CaretRightIcon size={16} color={colors.textPrimary} weight="bold" />
        </IconCircle>
      </View>

      <View style={styles.days} {...geser.panHandlers}>
        {hari.map((tanggal) => {
          const terpilih = tanggal === value;
          const nanti = tanggal > hariIni;
          const titik = complete.has(tanggal)
            ? colors.success
            : partial.has(tanggal)
              ? colors.warning
              : null;

          return (
            <Pressable
              key={tanggal}
              disabled={nanti}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(tanggal);
              }}
              style={({ pressed }) => [
                styles.day,
                tanggal === hariIni && !terpilih && styles.today,
                terpilih && styles.selected,
                nanti && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityLabel={tanggal}
            >
              <Text variant="caption" color={terpilih ? colors.background : colors.textTertiary}>
                {dayLabel(tanggal)}
              </Text>
              <Text variant="h3" color={terpilih ? colors.background : colors.textPrimary}>
                {String(Number(tanggal.slice(8)))}
              </Text>
              <View style={[styles.dot, { backgroundColor: titik ?? 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  days: { flexDirection: 'row', gap: spacing.xs },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  today: { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  selected: { backgroundColor: colors.textPrimary },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.3 },
});
