import * as Haptics from 'expo-haptics';
import { CaretLeftIcon, CaretRightIcon } from 'phosphor-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { fonts, radius, spacing } from '@/constants/theme';
import { monthEnd, monthStart, monthTitle, shiftMonths, todayWIB, weekdayMon } from '@/utils/date';
import { IconCircle } from './IconCircle';
import { Text } from './Text';

interface CalendarProps {
  /** Bulan yang ditampilkan: tanggal mana pun di bulan itu. */
  month: string;
  selected: string;
  /** Tanggal paling akhir yang boleh dipilih, biasanya hari ini. */
  maxDate: string;
  /** Tanggal bertitik hijau: ada catatan. */
  marked?: ReadonlySet<string>;
  /** Tanggal bertitik kuning: ada catatan tapi ditandai belum lengkap. */
  warned?: ReadonlySet<string>;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
}

const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/**
 * Kalender sebulan bertema GriviTness: gelap, tanggal terpilih merah, titik
 * hijau di hari yang ada catatannya, kuning di hari yang ditandai belum
 * lengkap. Tanggal masa depan tidak bisa dipilih.
 *
 * Titik sengaja kecil dan di bawah angka, bukan mewarnai seluruh sel: yang
 * dicari mata adalah hari TANPA titik, yaitu hari yang lupa dicatat.
 */
export const Calendar = ({
  month,
  selected,
  maxDate,
  marked,
  warned,
  onSelect,
  onMonthChange,
}: CalendarProps) => {
  const awal = monthStart(month);
  const jumlahHari = Number(monthEnd(month).slice(8, 10));
  const kosongDepan = weekdayMon(awal);
  const hariIni = todayWIB();
  const bisaMaju = awal < monthStart(maxDate);

  const sel: (string | null)[] = [
    ...Array.from({ length: kosongDepan }, () => null),
    ...Array.from(
      { length: jumlahHari },
      (_, i) => awal.slice(0, 8) + String(i + 1).padStart(2, '0'),
    ),
  ];
  while (sel.length % 7 !== 0) sel.push(null);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <IconCircle size={36} onPress={() => onMonthChange(shiftMonths(awal, -1))}>
          <CaretLeftIcon size={16} color={colors.textPrimary} weight="bold" />
        </IconCircle>
        <Text variant="h3" align="center" style={styles.title}>
          {monthTitle(awal)}
        </Text>
        <IconCircle
          size={36}
          onPress={bisaMaju ? () => onMonthChange(shiftMonths(awal, 1)) : undefined}
          style={bisaMaju ? undefined : styles.disabled}
        >
          <CaretRightIcon size={16} color={colors.textPrimary} weight="bold" />
        </IconCircle>
      </View>

      <View style={styles.row}>
        {HARI.map((h) => (
          <View key={h} style={styles.cell}>
            <Text variant="caption" tone="tertiary">
              {h}
            </Text>
          </View>
        ))}
      </View>

      {Array.from({ length: sel.length / 7 }, (_, minggu) => (
        <View key={minggu} style={styles.row}>
          {sel.slice(minggu * 7, minggu * 7 + 7).map((tanggal, i) => {
            if (tanggal === null) return <View key={'k' + String(i)} style={styles.cell} />;

            const nanti = tanggal > maxDate;
            const dipilih = tanggal === selected;
            const titik = warned?.has(tanggal)
              ? colors.warning
              : marked?.has(tanggal)
                ? colors.success
                : null;

            return (
              <Pressable
                key={tanggal}
                disabled={nanti}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onSelect(tanggal);
                }}
                style={styles.cell}
                accessibilityState={{ selected: dipilih, disabled: nanti }}
                accessibilityLabel={tanggal}
              >
                <View
                  style={[
                    styles.day,
                    dipilih && styles.daySelected,
                    !dipilih && tanggal === hariIni && styles.dayToday,
                  ]}
                >
                  <Text
                    style={styles.dayNumber}
                    color={
                      dipilih ? colors.white : nanti ? colors.textTertiary : colors.textPrimary
                    }
                  >
                    {Number(tanggal.slice(8, 10))}
                  </Text>
                </View>
                <View style={[styles.dot, titik ? { backgroundColor: titik } : null]} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { flex: 1 },
  disabled: { opacity: 0.35 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2, gap: 3 },
  day: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.textSecondary },
  dayNumber: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
