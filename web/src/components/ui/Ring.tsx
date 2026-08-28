import type { ReactNode } from 'react';

import { colors } from '@/constants/colors';

interface RingProps {
  /** 0 sampai 1. Boleh lewat 1, kelebihannya ditahan supaya tidak menggambar dua putaran. */
  progress: number;
  size?: number;
  thickness?: number;
  color?: string;
  /** Porsi lingkaran yang dipakai. 0.78 menyisakan celah di bawah. */
  sweep?: number;
  children?: ReactNode;
}

/**
 * Cincin progres bercelah.
 *
 * Digambar langsung dengan SVG, bukan lewat pustaka chart. Bentuk ini cuma
 * butuh dua busur dengan panjang garis yang dihitung, memakai pustaka untuk
 * itu berarti menarik dependency besar demi satu lingkaran.
 *
 * Celah di bawah bukan hiasan: ia memberi titik awal dan akhir yang jelas,
 * sehingga cincin yang hampir penuh masih bisa dibedakan dari yang sudah penuh.
 */
export const Ring = ({
  progress,
  size = 180,
  thickness = 14,
  color = colors.primary,
  sweep = 0.78,
  children,
}: RingProps) => {
  const radius = (size - thickness) / 2;
  const keliling = 2 * Math.PI * radius;

  const panjangJalur = keliling * sweep;
  const isi = panjangJalur * Math.min(Math.max(progress, 0), 1);

  // Diputar supaya celahnya berada di bawah, simetris kiri-kanan.
  const putar = 90 + (1 - sweep) * 180;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: `rotate(${putar}deg)` }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.surfaceHigh}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${panjangJalur} ${keliling}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${isi} ${keliling}`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}
      >
        {children}
      </div>
    </div>
  );
};
