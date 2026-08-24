import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { Text } from './Text';

export interface BarDatum {
  label: string;
  /**
   * null berarti hari itu TIDAK tercatat, dan itu berbeda dari nol langkah.
   * Menggambar nol untuk hari yang tidak dicatat sama saja mengklaim user tidak
   * melangkah sama sekali, padahal yang terjadi cuma tidak membuka aplikasi.
   */
  value: number | null;
  /** Keterangan pada gelembung saat batang dipilih. Kalau kosong, nilainya yang tampil. */
  caption?: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  color?: string;
  /** Batang yang disorot. Kalau kosong, batang tertinggi yang dipilih. */
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  formatValue?: (value: number) => string;
}

/**
 * Diagram batang dengan satu batang tersorot dan gelembung nilai di atasnya.
 *
 * Bentuk ini diambil langsung dari referensi visual: batang abu berujung
 * membulat, satu batang merah, dan label melayang di atas batang terpilih.
 * Digambar dengan View biasa — sebuah batang hanyalah persegi dengan tinggi
 * proporsional, dan memakai pustaka chart untuk itu justru menambah lapisan
 * tanpa menambah kemampuan.
 */
export const BarChart = ({
  data,
  height = 150,
  color = colors.primary,
  selectedIndex,
  onSelect,
  formatValue,
}: BarChartProps) => {
  const tertinggi = data.reduce((maks, d) => ((d.value ?? 0) > maks ? (d.value ?? 0) : maks), 0);

  const bawaan = data.reduce(
    (terpilih, d, i) => ((d.value ?? 0) > (data[terpilih]?.value ?? 0) ? i : terpilih),
    0,
  );

  const [internal, setInternal] = useState<number | null>(null);
  const aktif = selectedIndex ?? internal ?? bawaan;

  const pilih = (index: number) => {
    void Haptics.selectionAsync();
    setInternal(index);
    onSelect?.(index);
  };

  // Semua batang bernilai nol berarti belum ada data. Membagi dengan nol akan
  // menghasilkan NaN yang membuat seluruh chart hilang tanpa pesan apa pun.
  const skala = (value: number): number =>
    tertinggi <= 0 ? 0 : Math.max(6, (value / tertinggi) * height);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.plot, { height: height + 34 }]}>
        {data.map((d, i) => {
          const terpilih = i === aktif;

          return (
            <Pressable
              key={d.label + i}
              onPress={() => pilih(i)}
              style={styles.column}
              accessibilityRole="button"
              accessibilityLabel={d.label + ': ' + (d.value === null ? 'tidak tercatat' : d.value)}
            >
              <View style={styles.bubbleSlot}>
                {terpilih && d.value !== null && d.value > 0 ? (
                  <View style={[styles.bubble, { backgroundColor: color }]}>
                    <Text variant="caption" tone="inverse" numberOfLines={1}>
                      {d.caption ?? formatValue?.(d.value) ?? String(d.value)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.barSlot}>
                {/*
                  Hari tanpa catatan digambar sebagai garis tipis di garis dasar,
                  bukan batang pendek. Batang sependek apa pun tetap terbaca
                  sebagai "ada, sedikit" -- padahal yang benar "tidak diketahui".
                */}
                {d.value === null ? (
                  <View style={styles.barKosong} />
                ) : (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: skala(d.value),
                        backgroundColor: terpilih ? color : colors.surfaceHigh,
                      },
                    ]}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.labels}>
        {data.map((d, i) => (
          <View key={d.label + i} style={styles.labelSlot}>
            <Text variant="caption" tone={i === aktif ? 'primary' : 'tertiary'}>
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  plot: { flexDirection: 'row', alignItems: 'flex-end' },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bubbleSlot: { height: 30, justifyContent: 'flex-end', paddingBottom: spacing.xs },
  bubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { width: 26, borderRadius: radius.pill },
  barKosong: { width: 26, height: 3, borderRadius: radius.pill, backgroundColor: colors.border },
  labels: { flexDirection: 'row' },
  labelSlot: { flex: 1, alignItems: 'center' },
});
