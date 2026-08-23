import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { Text } from './Text';

export interface LinePoint {
  label: string;
  value: number | null;
}

interface LineChartProps {
  data: LinePoint[];
  height?: number;
  color?: string;
  /** Menampilkan nilai terkecil dan terbesar di tepi kiri. */
  showBounds?: boolean;
}

/**
 * Grafik garis untuk tren berat badan.
 *
 * Titik bernilai null berarti hari itu tidak ada catatan. Titik seperti itu
 * dilewati dan garisnya tetap tersambung ke titik berikutnya — menariknya ke
 * nol akan menggambarkan penurunan berat drastis yang tidak pernah terjadi.
 */
export const LineChart = ({
  data,
  height = 140,
  color = colors.primary,
  showBounds = true,
}: LineChartProps) => {
  const [lebar, setLebar] = useState(0);

  const ukur = (e: LayoutChangeEvent) => setLebar(e.nativeEvent.layout.width);

  const terisi = data
    .map((d, i) => ({ index: i, value: d.value }))
    .filter((d): d is { index: number; value: number } => d.value !== null);

  if (terisi.length === 0) {
    return (
      <View style={[styles.kosong, { height }]} onLayout={ukur}>
        <Text variant="caption" tone="tertiary">
          Belum ada data untuk digambar
        </Text>
      </View>
    );
  }

  const nilai = terisi.map((d) => d.value);
  const min = Math.min(...nilai);
  const maks = Math.max(...nilai);

  // Rentang nol terjadi kalau semua nilainya sama. Dibiarkan nol, pembagian
  // berikutnya menghasilkan NaN dan garisnya hilang; diberi rentang semu,
  // garisnya digambar mendatar di tengah — yang memang benar.
  const rentang = maks - min || 1;

  const pad = 10;
  const tinggiPlot = height - pad * 2;

  const x = (index: number): number =>
    data.length <= 1 ? lebar / 2 : (index / (data.length - 1)) * lebar;

  const y = (value: number): number => pad + (1 - (value - min) / rentang) * tinggiPlot;

  const titik = terisi.map((d) => ({ x: x(d.index), y: y(d.value) }));

  const garis = titik
    .map((t, i) => (i === 0 ? 'M' : 'L') + t.x.toFixed(1) + ' ' + t.y.toFixed(1))
    .join(' ');

  const area =
    garis +
    ' L' +
    (titik[titik.length - 1]?.x ?? 0).toFixed(1) +
    ' ' +
    height +
    ' L' +
    (titik[0]?.x ?? 0).toFixed(1) +
    ' ' +
    height +
    ' Z';

  const terakhir = titik[titik.length - 1];

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ height }} onLayout={ukur}>
        {lebar > 0 ? (
          <Svg width={lebar} height={height}>
            <Defs>
              <LinearGradient id="lineArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.28" />
                <Stop offset="1" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            <Path d={area} fill="url(#lineArea)" />
            <Path
              d={garis}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />

            {terakhir ? (
              <>
                <Circle cx={terakhir.x} cy={terakhir.y} r={7} fill={color} opacity={0.25} />
                <Circle
                  cx={terakhir.x}
                  cy={terakhir.y}
                  r={4}
                  fill={color}
                  stroke={colors.background}
                  strokeWidth={2}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>

      {showBounds ? (
        <View style={styles.bounds}>
          <Text variant="caption" tone="tertiary">
            {data[0]?.label ?? ''}
          </Text>
          <Text variant="caption" tone="tertiary">
            {min.toFixed(1)} – {maks.toFixed(1)}
          </Text>
          <Text variant="caption" tone="tertiary">
            {data[data.length - 1]?.label ?? ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  kosong: { alignItems: 'center', justifyContent: 'center' },
  bounds: { flexDirection: 'row', justifyContent: 'space-between' },
});
