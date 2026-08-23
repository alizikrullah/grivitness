import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
 * @shopify/react-native-skia — dependency native besar yang memberatkan build
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
        // Recharts memberi nilai bertipe lebar — bisa undefined, bahkan array
        // untuk chart bertumpuk. Hari tanpa penimbangan memang tidak punya
        // angka, jadi ditangani di sini alih-alih dipaksa dengan cast yang akan
        // menampilkan "undefined kg" di layar.
        formatter={(v) => [typeof v === 'number' ? v + unit : '—', '']}
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
  value: number;
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
