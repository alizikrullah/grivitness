/**
 * Palet GriviTness, diturunkan dari referensi visual.
 *
 * Aturan pemakaian merah: dipakai HEMAT tapi berani. Satu layar idealnya punya
 * satu titik merah dominan saja, CTA, chip aktif, atau satu batang chart.
 * Kalau merah dipakai di mana-mana, tidak ada lagi yang menonjol.
 */
export const colors = {
  /** Latar halaman. Nyaris hitam, bukan abu gelap. */
  background: '#0A0A0B',
  /** Permukaan kartu di atas background. */
  surface: '#141416',
  /** Kartu di dalam kartu, atau input. */
  surfaceAlt: '#1C1C1F',
  /** Elemen menonjol di atas surfaceAlt: chip non-aktif, lingkaran ikon. */
  surfaceHigh: '#26262A',

  primary: '#F2333F',
  primaryDim: '#C9202B',
  /** Latar lembut untuk badge dan highlight, tetap terbaca di atas surface. */
  primarySoft: 'rgba(242, 51, 63, 0.14)',
  primaryGlow: 'rgba(242, 51, 63, 0.35)',

  textPrimary: '#F7F7F8',
  textSecondary: '#9A9AA2',
  /** Untuk label sumbu chart dan keterangan yang sengaja dibuat redup. */
  textTertiary: '#5F5F68',

  success: '#2ED573',
  successSoft: 'rgba(46, 213, 115, 0.14)',
  warning: '#FFA726',
  warningSoft: 'rgba(255, 167, 38, 0.14)',
  danger: '#F2333F',

  border: '#232327',
  /** Garis tepi tipis yang meniru pantulan cahaya di atas kartu gelap. */
  borderSoft: 'rgba(255, 255, 255, 0.06)',
  borderFocus: '#F2333F',

  white: '#FFFFFF',
  black: '#000000',
  /** Penutup gelap di atas foto supaya teks tetap terbaca. */
  scrim: 'rgba(10, 10, 11, 0.72)',
} as const;

/** Warna per kategori data, dipakai konsisten di chart dan ikon seluruh aplikasi. */
export const metricColors = {
  weight: '#F2333F',
  calories: '#FF8A3D',
  steps: '#4DA3FF',
  water: '#38BDF8',
  sleep: '#A78BFA',
  workout: '#2ED573',
  mood: '#FBBF24',
  measurement: '#F472B6',
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
