/**
 * Backend mengelompokkan data harian menurut WIB (Asia/Jakarta), bukan menurut
 * timezone perangkat. Kalau mobile memakai tanggal lokal apa adanya, user yang
 * sedang di luar negeri akan melihat "hari ini" yang berbeda dari yang dicatat
 * backend. Semua tanggal di sini karena itu dihitung dalam WIB.
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

/** "Sabtu, 23 Agustus 2026", dipakai di header halaman. */
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
 * Keterangan tanggal untuk judul bagian di layar catat: "hari ini" atau
 * "23 Agu".
 *
 * Dipakai supaya judulnya mengikuti tanggal yang sedang dilihat. Judul yang
 * selalu berbunyi "hari ini" padahal yang tampil catatan minggu lalu membuat
 * user salah membaca datanya sendiri.
 */
export const dayPhrase = (date: string): string => (isToday(date) ? 'hari ini' : shortDate(date));

/**
 * Menggabungkan tanggal WIB dengan jam menjadi timestamp ISO UTC.
 *
 * Dipakai layar yang mengirim `logged_at` bertipe timestamp, user memilih jam
 * menurut WIB, tapi backend menerimanya dalam UTC.
 */
export const wibToISO = (date: string, time: string): string =>
  new Date(new Date(date + 'T' + time + ':00Z').getTime() - WIB_OFFSET_MS).toISOString();

/** "Sab 3 Okt", ditambah tahun kalau bukan tahun ini. Untuk kotak tanggal di layar catat. */
export const compactDate = (date: string): string => {
  const d = parseDateOnly(date);
  const tahun =
    d.getUTCFullYear() === Number(todayWIB().slice(0, 4)) ? '' : ' ' + d.getUTCFullYear();
  return (
    (HARI_PENDEK[d.getUTCDay()] ?? '') +
    ' ' +
    d.getUTCDate() +
    ' ' +
    (BULAN_PENDEK[d.getUTCMonth()] ?? '') +
    tahun
  );
};

/** "Hari ini, Sab 3 Okt", "Kemarin, Jum 2 Okt", atau "Kam 1 Okt". */
export const navDateLabel = (date: string): string => {
  const hariIni = todayWIB();
  if (date === hariIni) return 'Hari ini, ' + compactDate(date);
  if (date === shiftDays(hariIni, -1)) return 'Kemarin, ' + compactDate(date);
  return compactDate(date);
};

/** Tanggal pertama bulan dari sebuah tanggal YYYY-MM-DD. */
export const monthStart = (date: string): string => date.slice(0, 8) + '01';

/** Tanggal terakhir bulan dari sebuah tanggal YYYY-MM-DD. */
export const monthEnd = (date: string): string => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  // Hari ke-0 bulan berikutnya adalah hari terakhir bulan ini.
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** Tanggal pertama bulan yang digeser sejumlah bulan. */
export const shiftMonths = (date: string, months: number): string => {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
};

/** "Oktober 2026", judul kalender. */
export const monthTitle = (date: string): string =>
  (BULAN_PANJANG[Number(date.slice(5, 7)) - 1] ?? '') + ' ' + date.slice(0, 4);

/** Urutan hari dalam minggu, Senin = 0 sampai Minggu = 6. */
export const weekdayMon = (date: string): number => (parseDateOnly(date).getUTCDay() + 6) % 7;
