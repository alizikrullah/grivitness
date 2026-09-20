import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { colors } from '@/constants/colors';
import { fontFamily, fontSize } from '@/constants/theme';

/**
 * Chart untuk web memakai Recharts, sementara mobile menggambar SVG sendiri.
 *
 * Perbedaan yang disengaja. Di mobile, Victory Native mewajibkan
 * @shopify/react-native-skia, dependency native besar yang memberatkan build
 * EAS demi dua bentuk chart. Di web tidak ada biaya seperti itu: Recharts murni
 * JavaScript, dan yang didapat sebagai gantinya adalah tooltip, sumbu responsif,
 * dan penanganan data kosong yang tidak perlu ditulis ulang.
 */

const AXIS = {
  stroke: colors.textTertiary,
  fontSize: fontSize.caption,
  fontFamily,
  tickLine: false,
  axisLine: false,
} as const;

const TOOLTIP_STYLE = {
  background: colors.surfaceAlt,
  border: '1px solid ' + colors.border,
  borderRadius: 14,
  fontFamily,
  fontSize: fontSize.caption,
  color: colors.textPrimary,
} as const;

export interface LinePoint {
  label: string;
  value: number | null;
}

/**
 * Tren berat badan dengan area gradien.
 *
 * `connectNulls` sengaja true: hari tanpa penimbangan bukan berarti berat badan
 * menghilang. Memutus garisnya membuat tren terlihat penuh lubang padahal yang
 * terjadi cuma tidak menimbang hari itu.
 */
export const TrendChart = ({
  data,
  color = colors.primary,
  unit = '',
  height = 220,
}: {
  data: LinePoint[];
  color?: string;
  unit?: string;
  height?: number;
}) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      <CartesianGrid stroke={colors.border} vertical={false} />
      <XAxis dataKey="label" {...AXIS} />
      <YAxis {...AXIS} width={52} domain={['dataMin - 1', 'dataMax + 1']} />
      <Tooltip
        contentStyle={TOOLTIP_STYLE}
        labelStyle={{ color: colors.textSecondary }}
        // Recharts memberi nilai bertipe lebar, bisa undefined, bahkan array
        // untuk chart bertumpuk. Hari tanpa penimbangan memang tidak punya
        // angka, jadi ditangani di sini alih-alih dipaksa dengan cast yang akan
        // menampilkan "undefined kg" di layar.
        formatter={(v) => [typeof v === 'number' ? v + unit : '-', '']}
      />

      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={2.5}
        fill="url(#trend-fill)"
        connectNulls
        dot={{ r: 3, fill: color, strokeWidth: 0 }}
        activeDot={{ r: 5 }}
      />
    </AreaChart>
  </ResponsiveContainer>
);

export interface BarDatum {
  label: string;
  /** null berarti hari itu tidak tercatat, berbeda dari nol. Recharts melewatinya. */
  value: number | null;
}

/**
 * Batang dengan SATU batang tersorot.
 *
 * Menyorot hari ini adalah inti bentuk ini: tanpa itu, tujuh batang setinggi
 * hampir sama tidak memberi tahu apa pun tentang di mana user berada sekarang.
 */
export const HighlightBarChart = ({
  data,
  color = colors.primary,
  highlightIndex,
  height = 200,
}: {
  data: BarDatum[];
  color?: string;
  highlightIndex?: number;
  height?: number;
}) => {
  const sorot = highlightIndex ?? data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={colors.border} vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width={52} />
        <Tooltip
          cursor={{ fill: colors.surfaceAlt }}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: colors.textSecondary }}
        />

        <Bar dataKey="value" radius={[999, 999, 999, 999]} maxBarSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === sorot ? color : colors.surfaceHigh} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export interface BalanceDatum {
  label: string;
  /** Positif defisit, negatif surplus. Null berarti hari itu tidak tercatat. */
  value: number | null;
  caption?: string;
}

/**
 * Batang dua arah di sekitar garis nol: defisit ke atas hijau, surplus ke
 * bawah merah. Padanan BalanceChart di mobile. Recharts menangani nilai
 * negatif sendiri, jadi yang perlu diatur cuma warna per batang dan garis nol.
 */
export const BalanceBarChart = ({
  data,
  height = 220,
  formatValue = (v: number) => String(Math.round(v)),
}: {
  data: BalanceDatum[];
  height?: number;
  formatValue?: (value: number) => string;
}) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
      <CartesianGrid stroke={colors.border} vertical={false} />
      <XAxis dataKey="label" {...AXIS} />
      <YAxis {...AXIS} width={56} />
      <ReferenceLine y={0} stroke={colors.textTertiary} />
      <Tooltip
        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
        contentStyle={TOOLTIP_STYLE}
        labelStyle={{ color: colors.textSecondary }}
        formatter={(v, _n, item) => {
          const caption = (item?.payload as BalanceDatum | undefined)?.caption;
          if (caption) return [caption, ''];
          return [typeof v === 'number' ? formatValue(v) : 'tidak tercatat', ''];
        }}
      />
      <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={28}>
        {data.map((d, i) => (
          <Cell key={i} fill={(d.value ?? 0) >= 0 ? colors.success : colors.danger} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);
