import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Calendar, Sheet, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { useCalendarDays } from '@/services/misc.service';
import type { CalendarSection } from '@/types';
import { monthEnd, monthStart, todayWIB } from '@/utils/date';

/** Apa yang ditandai titik hijau di tiap layar, untuk keterangan di bawah kalender. */
const ISI: Record<CalendarSection, string> = {
  food: 'Ada catatan makan',
  water: 'Ada catatan minum',
  workout: 'Ada catatan olahraga',
  steps: 'Ada catatan langkah',
  sleep: 'Ada catatan tidur',
  weight: 'Ada catatan berat',
  mood: 'Ada catatan mood',
  'body-photo': 'Ada foto badan atau lingkar pinggang',
  'device-energy': 'Ada angka jam tangan',
  catat: 'Catatan harian lengkap',
};

/** Arti titik kuning, hanya untuk layar yang memakainya. */
const KUNING: Partial<Record<CalendarSection, string>> = {
  food: 'Ditandai belum lengkap',
  catat: 'Catatan harian belum lengkap',
};

interface CalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  value: string;
  onSelect: (date: string) => void;
  section: CalendarSection;
  maxDate?: string;
}

/**
 * Kalender sebulan di dalam Sheet, dipakai kotak tanggal tiap layar catat dan
 * header halaman Catat. Titik hijau berarti ada catatan (di halaman Catat:
 * catatan harian lengkap), kuning berarti belum lengkap.
 */
export const CalendarSheet = ({
  visible,
  onClose,
  value,
  onSelect,
  section,
  maxDate,
}: CalendarSheetProps) => {
  const hariIni = todayWIB();
  const [bulan, setBulan] = useState(monthStart(value));
  const [terakhirDibuka, setTerakhirDibuka] = useState(visible);

  // Setiap kali dibuka, mulai dari bulan tanggal yang sedang dipilih.
  // Disesuaikan saat render, bukan lewat useEffect.
  if (visible !== terakhirDibuka) {
    setTerakhirDibuka(visible);
    if (visible) setBulan(monthStart(value));
  }

  const tanda = useCalendarDays(section, monthStart(bulan), monthEnd(bulan), visible);
  const kuning = new Set(tanda.data?.incomplete ?? []);
  const hijau = new Set((tanda.data?.dates ?? []).filter((t) => !kuning.has(t)));

  return (
    <Sheet visible={visible} onClose={onClose} title="Pilih tanggal">
      <Calendar
        month={bulan}
        selected={value}
        maxDate={maxDate ?? hariIni}
        marked={hijau}
        warned={kuning}
        onSelect={onSelect}
        onMonthChange={setBulan}
      />

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text variant="caption" tone="secondary">
            {ISI[section]}
          </Text>
        </View>
        {KUNING[section] ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: colors.warning }]} />
            <Text variant="caption" tone="secondary">
              {KUNING[section]}
            </Text>
          </View>
        ) : null}
      </View>

      {value === hariIni ? null : (
        <Button label="Kembali ke hari ini" variant="secondary" onPress={() => onSelect(hariIni)} />
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
