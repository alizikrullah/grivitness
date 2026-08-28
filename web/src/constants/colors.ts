/**
 * Palet GriviTness. Nilainya IDENTIK dengan mobile/constants/colors.ts.
 *
 * Disalin, bukan dibagi lewat paket bersama, karena project ini sengaja tiga
 * folder terpisah tanpa monorepo tooling. Konsekuensinya: kalau palet di sini
 * berubah, mobile harus ikut diubah manual.
 */
export const colors = {
  background: '#0A0A0B',
  surface: '#141416',
  surfaceAlt: '#1C1C1F',
  surfaceHigh: '#26262A',

  primary: '#F2333F',
  primaryDim: '#C9202B',
  primarySoft: 'rgba(242, 51, 63, 0.14)',

  textPrimary: '#F7F7F8',
  textSecondary: '#9A9AA2',
  textTertiary: '#5F5F68',

  success: '#2ED573',
  warning: '#FFA726',
  danger: '#F2333F',

  border: '#232327',
  borderSoft: 'rgba(255, 255, 255, 0.06)',
  borderFocus: '#F2333F',

  white: '#FFFFFF',
} as const;

/**
 * Satu warna tetap per jenis data.
 *
 * Dipakai konsisten di ikon maupun chart supaya user mengenali metrik dari
 * warnanya sebelum sempat membaca labelnya.
 */
export const metricColors = {
  weight: '#F2333F',
  calories: '#FFA726',
  steps: '#4FC3F7',
  water: '#29B6F6',
  sleep: '#7E57C2',
  workout: '#26A69A',
  mood: '#FFCA28',
  measurements: '#EC407A',
  /**
   * Kalori keluar menurut perangkat. Emas tembaga, sengaja dijauhkan dari
   * oranye `calories` supaya kalori MASUK dan kalori KELUAR tidak pernah
   * tertukar hanya karena warnanya bersebelahan.
   */
  device: '#D9A441',
} as const;

export type MetricKey = keyof typeof metricColors;

/**
 * Nyala api pada cincin kalori.
 *
 * Dipisah dari `metricColors.calories` karena perannya berbeda: yang ini
 * gambar nyala, bukan penanda metrik. Badannya oranye kemerahan dengan garis
 * luar kuning, meniru nyala sungguhan yang selalu lebih terang di tepinya.
 */
export const flame = {
  body: '#FF5A2C',
  outline: '#FFD84D',
} as const;
