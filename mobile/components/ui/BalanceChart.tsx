import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { Text } from './Text';

export interface BalanceDatum {
  label: string;
  /** Positif ke atas, negatif ke bawah. Null berarti hari itu tidak tercatat. */
  value: number | null;
  /** Keterangan pada gelembung saat batang dipilih. */
  caption?: string;
}

interface BalanceChartProps {
  data: BalanceDatum[];
  /** Tinggi total area batang, dibagi dua sisi garis nol. */
  height?: number;
  formatValue?: (value: number) => string;
}

/**
 * Batang dua arah di sekitar garis nol: defisit ke atas, surplus ke bawah.
 *
 * BarChart yang ada hanya menggambar nilai positif, dan defisit kalori justru
 * paling berguna dilihat bersama surplusnya: minggu yang "bocor" kelihatan
 * sebagai batang merah di bawah garis, bukan sebagai batang pendek yang
 * mudah terlewat. Hari yang tidak tercatat digambar sebagai titik redup di
 * garis nol, bukan batang nol, karena nol kalori masuk pada hari yang tidak
 * dicatat bukan defisit, cuma lupa membuka aplikasi.
 */
export const BalanceChart = ({
  data,
  height = 160,
  formatValue = (v) => String(Math.round(v)),
}: BalanceChartProps) => {
  const [dipilih, setDipilih] = useState<number | null>(null);

  const nilai = data.map((d) => d.value).filter((v): v is number => v !== null);
  const puncak = Math.max(1, ...nilai.map((v) => Math.abs(v)));
  const setengah = height / 2;

  const pilih = (i: number) => {
    void Haptics.selectionAsync();
    setDipilih(dipilih === i ? null : i);
  };

  const terpilih = dipilih === null ? null : data[dipilih];

  return (
    <View style={styles.wrap}>
      <View style={styles.bubbleRow}>
        {terpilih && terpilih.value !== null ? (
          <View style={styles.bubble}>
            <Text variant="caption" tone="inverse">
              {terpilih.caption ?? formatValue(terpilih.value)}
            </Text>
          </View>
        ) : (
          <Text variant="caption" tone="tertiary">
            Sentuh batang untuk melihat angkanya
          </Text>
        )}
      </View>

      <View style={[styles.plot, { height }]}>
        {/* Garis nol */}
        <View style={[styles.nol, { top: setengah }]} />

        {data.map((d, i) => {
          const aktif = dipilih === i;

          if (d.value === null) {
            return (
              <Pressable key={i} onPress={() => pilih(i)} style={styles.kolom}>
                <View style={[styles.kosong, { top: setengah - 2 }]} />
              </Pressable>
            );
          }

          const tinggi = Math.max(3, (Math.abs(d.value) / puncak) * (setengah - 4));
          const defisit = d.value >= 0;

          return (
            <Pressable key={i} onPress={() => pilih(i)} style={styles.kolom}>
              <View
                style={[
                  styles.batang,
                  defisit
                    ? { bottom: setengah, height: tinggi }
                    : { top: setengah, height: tinggi },
                  {
                    backgroundColor: defisit ? colors.success : colors.danger,
                    opacity: aktif ? 1 : 0.7,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.labels}>
        {data.map((d, i) => (
          <View key={i} style={styles.kolom}>
            <Text
              variant="caption"
              tone={dipilih === i ? 'primary' : 'tertiary'}
              align="center"
              numberOfLines={1}
            >
              {d.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  bubbleRow: { minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  plot: { flexDirection: 'row', position: 'relative' },
  nol: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  kolom: { flex: 1, alignItems: 'center', position: 'relative' },
  batang: { position: 'absolute', width: '55%', borderRadius: 3 },
  kosong: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
  },
  labels: { flexDirection: 'row' },
});
