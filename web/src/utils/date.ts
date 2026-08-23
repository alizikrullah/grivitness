/**
 * Backend mengelompokkan data harian menurut WIB (Asia/Jakarta), bukan menurut
 * timezone perangkat. Kalau layar memakai tanggal lokal apa adanya, user yang
 * sedang di luar negeri akan melihat "hari ini" yang berbeda dari yang dicatat
 * backend. Semua tanggal di sini karena itu dihitung dalam WIB.
 *
 * Berkas ini SALINAN dari mobile/utils/date.ts. Project ini sengaja tiga folder
 * terpisah tanpa monorepo tooling, jadi perubahan di satu sisi harus diikutkan
 * manual ke sisi lain.
 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export const toWIBDate = (date: Date): string =>
  new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);

/** Tanggal hari ini menurut WIB, format YYYY-MM-DD. */
export const todayWIB = (): string => toWIBDate(new Date());

/** Menggeser tanggal YYYY-MM-DD sejumlah hari. Negatif berarti mundur. */
export const shiftDays = (date: string, days: number): string =>
  new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** Selisih hari antara dua tanggal YYYY-MM-DD. */
export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 86_400_000,
  );

/** Deretan tanggal dari `from` sampai `to`, inklusif. */
export const dateRange = (from: string, to: string): string[] => {
  const hasil: string[] = [];
  for (let i = 0; i <= daysBetween(from, to); i += 1) hasil.push(shiftDays(from, i));
  return hasil;
};

const parseDateOnly = (date: string): Date => new Date(date + 'T00:00:00Z');

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const HARI_PANJANG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_PENDEK = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];
const BULAN_PANJANG = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "Sen", "Sel", ... untuk label sumbu chart. */
export const dayLabel = (date: string): string =>
  HARI_PENDEK[parseDateOnly(date).getUTCDay()] ?? '';

/** "23 Agu" */
export const shortDate = (date: string): string => {
  const d = parseDateOnly(date);
  return d.getUTCDate() + ' ' + (BULAN_PENDEK[d.getUTCMonth()] ?? '');
};

/** "Sabtu, 23 Agustus 2026" — dipakai di header halaman. */
export const longDate = (date: string): string => {
  const d = parseDateOnly(date);
  const hari = HARI_PANJANG[d.getUTCDay()] ?? '';
  const bulan = BULAN_PANJANG[d.getUTCMonth()] ?? '';
  return hari + ', ' + d.getUTCDate() + ' ' + bulan + ' ' + d.getUTCFullYear();
};

/** Nama bulan panjang, untuk judul rekap bulanan. */
export const monthName = (month: number): string => BULAN_PANJANG[month - 1] ?? '';

/** Jam "07:30" dari timestamp ISO, dibaca dalam WIB. */
export const timeWIB = (timestamp: string): string =>
  new Date(new Date(timestamp).getTime() + WIB_OFFSET_MS).toISOString().slice(11, 16);

/** Sapaan yang menyesuaikan jam WIB. */
export const greeting = (): string => {
  const jam = Number(new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(11, 13));
  if (jam < 11) return 'Selamat pagi';
  if (jam < 15) return 'Selamat siang';
  if (jam < 19) return 'Selamat sore';
  return 'Selamat malam';
};

export const isToday = (date: string): boolean => date === todayWIB();

/**
 * Menggabungkan tanggal WIB dengan jam menjadi timestamp ISO UTC.
 *
 * Dipakai layar yang mengirim `logged_at` bertipe timestamp — user memilih jam
 * menurut WIB, tapi backend menerimanya dalam UTC.
 */
export const wibToISO = (date: string, time: string): string =>
  new Date(new Date(date + 'T' + time + ':00Z').getTime() - WIB_OFFSET_MS).toISOString();
