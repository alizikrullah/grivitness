import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

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

/** Ruang di atas batang yang disediakan untuk gelembung nilai. */
const RUANG_GELEMBUNG = 34;

/**
 * Diagram batang dengan satu batang tersorot dan gelembung nilai di atasnya.
 *
 * Bentuk ini diambil langsung dari referensi visual: batang abu berujung
 * membulat, satu batang merah, dan label melayang di atas batang terpilih.
 * Digambar dengan View biasa, karena sebuah batang hanyalah persegi dengan
 * tinggi proporsional dan memakai pustaka chart untuk itu justru menambah
 * lapisan tanpa menambah kemampuan.
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

  /**
   * Lebar area chart dan lebar gelembungnya diukur saat tata letak, bukan
   * ditebak. Keduanya dipakai untuk menempatkan gelembung secara absolut.
   */
  const [lebarPlot, setLebarPlot] = useState(0);
  const [lebarGelembung, setLebarGelembung] = useState(0);

  const pilih = (index: number) => {
    void Haptics.selectionAsync();
    setInternal(index);
    onSelect?.(index);
  };

  // Semua batang bernilai nol berarti belum ada data. Membagi dengan nol akan
  // menghasilkan NaN yang membuat seluruh chart hilang tanpa pesan apa pun.
  const skala = (value: number): number =>
    tertinggi <= 0 ? 0 : Math.max(6, (value / tertinggi) * height);

  const terpilihData = data[aktif];
  const adaGelembung =
    terpilihData !== undefined && terpilihData.value !== null && terpilihData.value > 0;

  const teksGelembung = adaGelembung
    ? (terpilihData.caption ?? formatValue?.(terpilihData.value ?? 0) ?? String(terpilihData.value))
    : '';

  /**
   * Gelembung digambar sebagai lapisan melayang di atas seluruh chart, BUKAN
   * sebagai anak dari kolom batangnya.
   *
   * Sebelumnya ia tinggal di dalam kolom, dan tujuh kolom membagi habis lebar
   * layar menjadi sekitar 45px masing-masing. Teks selebar "1.800" tidak muat
   * di situ lalu dipotong jadi "18..", yang membuat chart menampilkan angka
   * yang bukan angkanya. Ditempatkan absolut, lebar kolom tidak lagi
   * mengurungnya.
   */
  const lebarKolom = data.length > 0 ? lebarPlot / data.length : 0;
  const titikTengah = lebarKolom * aktif + lebarKolom / 2;

  // Ditahan di kedua tepi supaya gelembung pada batang paling pinggir tetap
  // utuh di dalam chart, bukan menggantung setengah di luar layar.
  const kiriGelembung = Math.min(
    Math.max(titikTengah - lebarGelembung / 2, 0),
    Math.max(lebarPlot - lebarGelembung, 0),
  );

  const ukurPlot = (e: LayoutChangeEvent) => setLebarPlot(e.nativeEvent.layout.width);
  const ukurGelembung = (e: LayoutChangeEvent) => setLebarGelembung(e.nativeEvent.layout.width);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.plot, { height: height + RUANG_GELEMBUNG }]} onLayout={ukurPlot}>
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
              <View style={styles.barSlot}>
                {/*
                  Hari tanpa catatan digambar sebagai garis tipis di garis dasar,
                  bukan batang pendek. Batang sependek apa pun tetap terbaca
                  sebagai "ada, sedikit", padahal yang benar "tidak diketahui".
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

        {adaGelembung ? (
          <View
            onLayout={ukurGelembung}
            style={[
              styles.bubble,
              {
                backgroundColor: color,
                left: kiriGelembung,
                maxWidth: lebarPlot > 0 ? lebarPlot : undefined,
                // Disembunyikan sampai lebarnya terukur. Tanpa ini gelembung
                // sempat tergambar di posisi yang salah selama satu frame lalu
                // meloncat ke tempatnya.
                opacity: lebarGelembung > 0 ? 1 : 0,
              },
            ]}
            pointerEvents="none"
          >
            <Text variant="caption" tone="inverse" numberOfLines={1}>
              {teksGelembung}
            </Text>
          </View>
        ) : null}
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
  bubble: {
    position: 'absolute',
    top: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  barSlot: { flex: 1, justifyContent: 'flex-end', paddingTop: RUANG_GELEMBUNG },
  bar: { width: 26, borderRadius: radius.pill },
  barKosong: { width: 26, height: 3, borderRadius: radius.pill, backgroundColor: colors.border },
  labels: { flexDirection: 'row' },
  labelSlot: { flex: 1, alignItems: 'center' },
});
