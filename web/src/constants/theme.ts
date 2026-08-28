/**
 * Token desain dalam bentuk TypeScript.
 *
 * Sebagian besar styling memakai custom property CSS di styles/tokens.css.
 * Yang di sini dipakai ketika nilainya harus masuk ke JavaScript, misalnya
 * dikirim ke Recharts sebagai prop, atau dipakai menghitung ukuran SVG.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  card: 24,
  lg: 18,
  md: 14,
  pill: 999,
} as const;

export const fontFamily =
  "'Plus Jakarta Sans Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Ukuran teks untuk elemen yang digambar di dalam SVG, di luar jangkauan CSS. */
export const fontSize = {
  caption: 12,
  label: 14,
  body: 15,
  h3: 17,
  metric: 30,
} as const;
