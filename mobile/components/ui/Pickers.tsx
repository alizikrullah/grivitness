import * as Haptics from 'expo-haptics';
import { MinusIcon, PlusIcon } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

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
 * Pengatur angka: bisa diketik langsung, bisa juga digeser tombol.
 *
 * Dua cara sengaja disediakan berdampingan. Tombol tambah-kurang enak untuk
 * penyesuaian kecil — naik 0,1 kg dari kemarin — tapi menyiksa kalau angkanya
 * jauh, misalnya mengisi 8.500 langkah dari nol. Angkanya karena itu berupa
 * kolom isian sungguhan yang tinggal disentuh lalu diketik.
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
  /**
   * Teks mentah selama user mengetik. Bernilai null berarti tidak sedang
   * diketik, dan yang ditampilkan adalah `value` yang sudah rapi.
   *
   * Dibutuhkan karena keadaan setengah jadi seperti "82," atau "" bukan angka
   * yang sah. Kalau tiap ketukan langsung dipaksa jadi number, koma yang baru
   * diketik akan hilang seketika dan angkanya mustahil diisi.
   */
  const [teks, setTeks] = useState<string | null>(null);

  const geser = (arah: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Dibulatkan ke jumlah desimal yang ditampilkan. Tanpa ini, penjumlahan
    // pecahan biner menghasilkan nilai seperti 82.30000000000001.
    const baru = clamp(Number((value + arah * step).toFixed(decimals + 2)), min, max);
    setTeks(null);
    onChange(Number(baru.toFixed(decimals)));
  };

  const ketik = (masuk: string) => {
    // Koma diterima karena itu pemisah desimal yang dipakai di Indonesia, dan
    // papan ketik angka Android memberi koma, bukan titik.
    const bersih = masuk.replace(',', '.').replace(/[^0-9.]/g, '');

    // Titik kedua dan seterusnya dibuang — "82.5.3" bukan angka.
    const bagian = bersih.split('.');
    const hasil = bagian.length > 2 ? bagian[0] + '.' + bagian.slice(1).join('') : bersih;

    setTeks(hasil);

    const angka = Number(hasil);

    // Nilainya diteruskan ke atas SEKARANG, tidak menunggu kolom kehilangan
    // fokus. Menunggu blur berarti user yang mengetik angka lalu langsung
    // menekan tombol simpan akan menyimpan nilai lama — dan kegagalan itu tidak
    // terlihat sama sekali, karena permintaannya sendiri berhasil.
    //
    // Batas bawah sengaja belum ditegakkan di sini. Mengetik "82" melewati
    // keadaan "8" lebih dulu, dan menjepitnya ke batas minimum tiap ketukan
    // membuat angkanya melompat-lompat saat diketik. Penjepitan penuh dilakukan
    // saat selesai.
    if (hasil.trim() !== '' && Number.isFinite(angka)) {
      onChange(Number(Math.min(angka, max).toFixed(decimals)));
    }
  };

  const selesai = () => {
    if (teks === null) return;

    const angka = Number(teks);

    // Kolom kosong atau isian tak masuk akal dikembalikan ke nilai sebelumnya,
    // bukan dipaksa jadi nol. Nol adalah berat badan yang mustahil, dan
    // menyimpannya diam-diam lebih berbahaya daripada membatalkan ketikan.
    if (teks.trim() !== '' && Number.isFinite(angka)) {
      onChange(Number(clamp(angka, min, max).toFixed(decimals)));
    }

    setTeks(null);
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
        <TextInput
          value={teks ?? value.toFixed(decimals)}
          onChangeText={ketik}
          onFocus={() => setTeks(value.toFixed(decimals))}
          onBlur={selesai}
          onSubmitEditing={selesai}
          keyboardType={decimals > 0 ? 'decimal-pad' : 'number-pad'}
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel="Nilai"
          style={styles.stepInput}
        />
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
  /**
   * Garis bawah tipis adalah satu-satunya petunjuk bahwa angka ini bisa
   * diketik. Tanpa itu, kolom isian yang tidak berbingkai terlihat sama persis
   * dengan teks biasa dan tidak ada yang tahu ia bisa disentuh.
   */
  stepInput: {
    ...typography.metric,
    color: colors.textPrimary,
    textAlign: 'center',
    minWidth: 140,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
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
