/**
 * Mengubah nilai decimal dari API menjadi number.
 *
 * Directus mengembalikan kolom decimal sebagai string, dan Number('') bernilai
 * 0 — bukan NaN. Tanpa pemeriksaan string kosong, kolom kosong akan terbaca
 * sebagai angka 0 yang terlihat sah padahal salah.
 */
export const toNum = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value.trim() === '') return null;
  const angka = Number(value);
  return Number.isFinite(angka) ? angka : null;
};

/** Sama dengan toNum tapi jatuh ke nilai cadangan, untuk tempat yang butuh angka pasti. */
export const numOr = (value: string | number | null | undefined, fallback: number): number =>
  toNum(value) ?? fallback;

/** Pemisah ribuan gaya Indonesia: 1234 menjadi "1.234". */
export const thousands = (value: number): string => {
  const bulat = Math.round(value);
  const tanda = bulat < 0 ? '-' : '';
  const digit = Math.abs(bulat).toString();
  let hasil = '';
  for (let i = 0; i < digit.length; i += 1) {
    const sisa = digit.length - i;
    hasil += digit[i];
    if (sisa > 1 && sisa % 3 === 1) hasil += '.';
  }
  return tanda + hasil;
};

/** Berat dalam kg, atau tanda pisah kalau datanya belum ada. */
export const kg = (value: number | string | null | undefined, digits = 1): string => {
  const angka = toNum(value);
  return angka === null ? '-' : angka.toFixed(digits);
};

/** 485 menit menjadi "8j 5m". Dipakai untuk tidur dan olahraga. */
export const duration = (minutes: number): string => {
  if (minutes <= 0) return '0m';
  const jam = Math.floor(minutes / 60);
  const menit = Math.round(minutes % 60);
  if (jam === 0) return menit + 'm';
  if (menit === 0) return jam + 'j';
  return jam + 'j ' + menit + 'm';
};

/** 2400 ml menjadi "2,4 L" begitu lewat satu liter. */
export const volume = (ml: number): string =>
  ml >= 1000 ? (ml / 1000).toFixed(1).replace('.', ',') + ' L' : ml + ' ml';

export const percent = (value: number, total: number): number =>
  total <= 0 ? 0 : Math.min(100, Math.round((value / total) * 100));

/** Rasio 0-1 tanpa dibatasi 100%, untuk chart yang boleh melewati target. */
export const ratio = (value: number, total: number): number => (total <= 0 ? 0 : value / total);

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((kata) => (kata[0] ?? '').toUpperCase())
    .join('');

/** Menambahkan tanda + di depan angka positif, supaya perubahan berat terbaca jelas. */
export const signed = (value: number, digits = 1): string =>
  (value > 0 ? '+' : '') + value.toFixed(digits);
