import { describe, expect, it } from 'vitest';

import { AppError } from './api-error.js';
import { round, toNumber, toNumberOrNull } from './number.js';

describe('toNumber', () => {
  /**
   * Alasan utama helper ini ada: Directus mengembalikan kolom decimal sebagai
   * string, dan aritmetika langsung pada string gagal secara diam-diam.
   */
  it('mengubah string decimal dari Directus jadi number', () => {
    expect(toNumber('82.55')).toBe(82.55);
  });

  it('membiarkan number apa adanya', () => {
    expect(toNumber(82.55)).toBe(82.55);
  });

  it('menangani nol dan nilai negatif', () => {
    expect(toNumber('0')).toBe(0);
    expect(toNumber('0.00')).toBe(0);
    expect(toNumber('-3.5')).toBe(-3.5);
  });

  /** Bukti bahwa masalah yang dicegah helper ini nyata. */
  it('hasilnya bisa dipakai aritmetika, tidak seperti stringnya', () => {
    const dariDirectus = '82.55';

    expect(dariDirectus + 1).toBe('82.551');
    expect(toNumber(dariDirectus) + 1).toBe(83.55);
  });

  it.each(['', 'abc', 'NaN', '12kg', 'Infinity'])(
    'melempar AppError untuk nilai tidak valid "%s"',
    (nilai) => {
      expect(() => toNumber(nilai)).toThrow(AppError);
    },
  );
});

describe('toNumberOrNull', () => {
  it('meneruskan null apa adanya', () => {
    expect(toNumberOrNull(null)).toBeNull();
  });

  it('mengubah string jadi number kalau tidak null', () => {
    expect(toNumberOrNull('68.25')).toBe(68.25);
  });

  /** Kolom ukuran badan boleh kosong, tapi nol adalah nilai yang sah. */
  it('membedakan nol dari null', () => {
    expect(toNumberOrNull('0')).toBe(0);
    expect(toNumberOrNull(null)).toBeNull();
  });
});

describe('round', () => {
  it('membulatkan ke dua angka di belakang koma secara bawaan', () => {
    expect(round(82.556)).toBe(82.56);
    expect(round(82.554)).toBe(82.55);
  });

  it('menerima jumlah angka desimal lain', () => {
    expect(round(1.23456, 3)).toBe(1.235);
    expect(round(1.5, 0)).toBe(2);
  });

  /** Kasus klasik galat floating point: 1.005 tanpa koreksi membulat jadi 1.00. */
  it('menangani galat floating point', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
  });
});
