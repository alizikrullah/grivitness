import { describe, expect, it } from 'vitest';

import {
  calculateAge,
  calculateBMR,
  calculateCalorieBudget,
  calculateTDEE,
  caloriesFromSteps,
  caloriesFromWorkout,
  daysBetween,
  distanceFromSteps,
} from './calories.js';

describe('calculateAge', () => {
  it('menghitung usia dari tanggal lahir', () => {
    expect(calculateAge('1996-08-22', new Date('2026-08-22T00:00:00Z'))).toBe(30);
  });

  /** Kesalahan klasik: pakai selisih tahun saja, jadi kelebihan satu. */
  it('mengurangi satu kalau ulang tahun belum lewat tahun ini', () => {
    expect(calculateAge('1996-12-31', new Date('2026-08-22T00:00:00Z'))).toBe(29);
  });

  it('tepat bertambah pada hari ulang tahunnya', () => {
    expect(calculateAge('1996-08-21', new Date('2026-08-21T00:00:00Z'))).toBe(30);
    expect(calculateAge('1996-08-23', new Date('2026-08-22T00:00:00Z'))).toBe(29);
  });
});

describe('calculateBMR', () => {
  const dasar = { weightKg: 80, heightCm: 175, age: 30 };

  /** Mifflin-St Jeor pria: (10*80) + (6.25*175) - (5*30) + 5 = 1748.75 -> 1749 */
  it('memakai konstanta +5 untuk pria', () => {
    expect(calculateBMR({ ...dasar, gender: 'MALE' })).toBe(1749);
  });

  /** Wanita: (10*80) + (6.25*175) - (5*30) - 161 = 1582.75 -> 1583 */
  it('memakai konstanta -161 untuk wanita', () => {
    expect(calculateBMR({ ...dasar, gender: 'FEMALE' })).toBe(1583);
  });

  /**
   * OTHER memakai titik tengah kedua konstanta (-78). Bukan angka dari
   * literatur, tapi pilihan yang menghindari memaksa siapa pun masuk kategori
   * yang tidak sesuai. Hasilnya harus berada persis di antara keduanya.
   */
  it('menempatkan OTHER di antara pria dan wanita', () => {
    const pria = calculateBMR({ ...dasar, gender: 'MALE' });
    const wanita = calculateBMR({ ...dasar, gender: 'FEMALE' });
    const lain = calculateBMR({ ...dasar, gender: 'OTHER' });

    expect(lain).toBeLessThan(pria);
    expect(lain).toBeGreaterThan(wanita);
  });

  it('naik seiring berat dan tinggi, turun seiring usia', () => {
    const acuan = calculateBMR({ ...dasar, gender: 'MALE' });

    expect(calculateBMR({ ...dasar, weightKg: 90, gender: 'MALE' })).toBeGreaterThan(acuan);
    expect(calculateBMR({ ...dasar, heightCm: 185, gender: 'MALE' })).toBeGreaterThan(acuan);
    expect(calculateBMR({ ...dasar, age: 50, gender: 'MALE' })).toBeLessThan(acuan);
  });
});

describe('calculateTDEE', () => {
  it('mengalikan BMR dengan pengali level aktivitas', () => {
    expect(calculateTDEE(1749, 'SEDENTARY')).toBe(2099);
    expect(calculateTDEE(1749, 'EXTRA_ACTIVE')).toBe(3323);
  });

  it('makin aktif makin besar', () => {
    const level = [
      'SEDENTARY',
      'LIGHTLY_ACTIVE',
      'MODERATELY_ACTIVE',
      'VERY_ACTIVE',
      'EXTRA_ACTIVE',
    ] as const;

    const hasil = level.map((l) => calculateTDEE(1749, l));
    const urut = [...hasil].sort((a, b) => a - b);

    expect(hasil).toEqual(urut);
  });
});

describe('estimasi dari langkah', () => {
  it('menghitung kalori dari langkah dan berat badan', () => {
    expect(caloriesFromSteps(10_000, 80)).toBe(400);
  });

  it('menghitung jarak dengan asumsi langkah 80cm', () => {
    expect(distanceFromSteps(10_000)).toBe(8);
  });

  it('nol langkah berarti nol', () => {
    expect(caloriesFromSteps(0, 80)).toBe(0);
    expect(distanceFromSteps(0)).toBe(0);
  });
});

describe('caloriesFromWorkout', () => {
  /** Nilai library adalah estimasi untuk 70kg, jadi 70kg tidak di-scale. */
  it('tidak mengubah nilai untuk berat 70kg', () => {
    expect(caloriesFromWorkout(10, 30, 70)).toBe(300);
  });

  it('menaikkan hasil untuk berat di atas 70kg', () => {
    expect(caloriesFromWorkout(10, 30, 90)).toBeGreaterThan(300);
  });

  it('menurunkan hasil untuk berat di bawah 70kg', () => {
    expect(caloriesFromWorkout(10, 30, 50)).toBeLessThan(300);
  });
});

describe('daysBetween', () => {
  it('menghitung selisih hari', () => {
    expect(daysBetween('2026-08-22', '2026-09-01')).toBe(10);
  });

  it('tanggal yang sama berarti nol', () => {
    expect(daysBetween('2026-08-22', '2026-08-22')).toBe(0);
  });

  it('negatif kalau tanggal tujuan sudah lewat', () => {
    expect(daysBetween('2026-08-22', '2026-08-12')).toBe(-10);
  });
});

describe('calculateCalorieBudget', () => {
  it('menyebar defisit merata sepanjang sisa hari', () => {
    // Turun 5kg dalam 100 hari = 38500 kkal / 100 = 385 kkal per hari.
    const hasil = calculateCalorieBudget({
      tdee: 2500,
      currentWeightKg: 85,
      targetWeightKg: 80,
      daysRemaining: 100,
    });

    expect(hasil.required_deficit).toBe(385);
    expect(hasil.daily_calorie_budget).toBe(2115);
    expect(hasil.achievable).toBe(true);
  });

  /**
   * Bagian terpenting: target yang mustahil TIDAK boleh menghasilkan anjuran
   * berbahaya. Budget ditahan di batas bawah, dan achievable memberi tahu user
   * bahwa targetnya tidak realistis.
   */
  it('menahan budget di batas aman untuk target yang terlalu agresif', () => {
    const hasil = calculateCalorieBudget({
      tdee: 2000,
      currentWeightKg: 90,
      targetWeightKg: 70,
      daysRemaining: 14,
    });

    expect(hasil.daily_calorie_budget).toBe(1200);
    expect(hasil.achievable).toBe(false);
    // Defisit yang dibutuhkan jauh lebih besar dari yang benar-benar dipakai.
    expect(hasil.required_deficit).toBeGreaterThan(hasil.daily_deficit);
  });

  it('menghasilkan surplus untuk target menaikkan berat badan', () => {
    const hasil = calculateCalorieBudget({
      tdee: 2000,
      currentWeightKg: 60,
      targetWeightKg: 65,
      daysRemaining: 100,
    });

    expect(hasil.daily_calorie_budget).toBeGreaterThan(2000);
    expect(hasil.daily_deficit).toBeLessThan(0);
    expect(hasil.achievable).toBe(true);
  });

  /** Tanggal target hari ini juga: jangan sampai membagi dengan nol. */
  it('tidak meledak saat sisa hari nol', () => {
    const hasil = calculateCalorieBudget({
      tdee: 2000,
      currentWeightKg: 80,
      targetWeightKg: 80,
      daysRemaining: 0,
    });

    expect(Number.isFinite(hasil.daily_calorie_budget)).toBe(true);
    expect(hasil.daily_calorie_budget).toBe(2000);
  });
});
