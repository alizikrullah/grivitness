import { AppError } from './api-error.js';

/**
 * Directus mengembalikan kolom decimal sebagai STRING, bukan number.
 * Sudah diverifikasi ke instance: weight_kg 82.55 terbaca "82.55".
 *
 * Aritmetika langsung pada nilai itu diam-diam salah — `"82.55" + 1` menghasilkan
 * `"82.551"` tanpa melempar error apapun. Jadi setiap decimal dari Directus
 * WAJIB lewat helper ini dulu sebelum dipakai berhitung.
 */
export const toNumber = (value: string | number): number => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AppError(
        500,
        'INTERNAL_ERROR',
        `Nilai numerik tidak valid dari database: ${value}`,
      );
    }
    return value;
  }

  // Number('') dan Number('   ') menghasilkan 0, bukan NaN. Tanpa pemeriksaan
  // ini, kolom decimal yang kosong akan terbaca sebagai berat 0 kg — salah,
  // tapi tidak melempar error apa pun sehingga sulit terdeteksi.
  if (value.trim() === '') {
    throw new AppError(500, 'INTERNAL_ERROR', 'Nilai numerik kosong dari database');
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(
      500,
      'INTERNAL_ERROR',
      `Nilai numerik tidak valid dari database: "${value}"`,
    );
  }

  return parsed;
};

/** Versi toNumber yang menerima null, untuk kolom decimal yang nullable. */
export const toNumberOrNull = (value: string | number | null): number | null =>
  value === null ? null : toNumber(value);

/** Membulatkan ke sekian angka di belakang koma, menghindari galat floating point. */
export const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};
