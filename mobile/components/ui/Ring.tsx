import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors } from '@/constants/colors';
import { clamp } from '@/utils/format';

interface RingProps {
  /** Nilai 0-1. Lebih dari 1 tetap digambar penuh, tapi warnanya boleh berubah. */
  progress: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  children?: ReactNode;
  /**
   * Bagian lingkaran yang dipakai, 1 berarti penuh. Nilai seperti 0.75
   * menyisakan celah di bawah — bentuk pengukur yang dipakai di referensi.
   */
  sweep?: number;
}

/**
 * Cincin progres berbasis SVG.
 *
 * Dibuat sendiri alih-alih memakai pustaka chart karena bentuk yang diminta
 * referensi — cincin dengan celah, ujung membulat, dan isi bebas di tengah —
 * justru lebih ribet dipaksakan lewat pustaka daripada digambar langsung.
 */
export const Ring = ({
  progress,
  size = 160,
  thickness = 12,
  color = colors.primary,
  trackColor = colors.surfaceHigh,
  children,
  sweep = 1,
}: RingProps) => {
  const radius = (size - thickness) / 2;
  const keliling = 2 * Math.PI * radius;
  const panjangTrack = keliling * sweep;
  const panjangIsi = panjangTrack * clamp(progress, 0, 1);

  // Diputar supaya awal busur ada di atas. Kalau ada celah, busurnya digeser
  // setengah celah lagi agar celahnya jatuh simetris di bawah.
  const rotasi = -90 + ((1 - sweep) * 360) / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: rotasi + 'deg' }] }}>
        <Defs>
          <LinearGradient id="ringFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={panjangTrack + ' ' + keliling}
          fill="none"
        />

        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringFill)"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={panjangIsi + ' ' + keliling}
          fill="none"
        />
      </Svg>

      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
