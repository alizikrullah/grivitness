import { describe, expect, it } from 'vitest';

import { dailyTargets, macroTarget, sleepTarget, stepTarget, waterTargetMl } from './targets.js';

describe('waterTargetMl', () => {
  /** 35 ml/kg untuk dewasa muda: 70 x 35 = 2450. */
  it('menurunkan target dari berat badan', () => {
    expect(waterTargetMl(70, 30)).toBe(2450);
  });

  /**
   * Yang hilang dari angka tetap 2500ml: orang bertubuh kecil dipaksa minum
   * berlebihan sementara yang bertubuh besar merasa cukup padahal belum.
   */
  it('membedakan tubuh besar dan kecil', () => {
    expect(waterTargetMl(100, 30)).toBeGreaterThan(waterTargetMl(50, 30));
  });

  it('memakai rasio lebih rendah untuk usia lanjut', () => {
    expect(waterTargetMl(70, 60)).toBeLessThan(waterTargetMl(70, 30));
  });

  it('menambah cairan sebanding lama olahraga', () => {
    expect(waterTargetMl(70, 30, 60)).toBe(waterTargetMl(70, 30) + 500);
  });

  /** Minum berlebihan bukan tidak berbahaya, hiponatremia itu nyata. */
  it('menahan di batas atas dan bawah yang masuk akal', () => {
    expect(waterTargetMl(200, 30, 300)).toBeLessThanOrEqual(4000);
    expect(waterTargetMl(30, 30)).toBeGreaterThanOrEqual(1500);
  });
});

describe('sleepTarget', () => {
  /** National Sleep Foundation: 7-9 jam untuk dewasa. */
  it('mengembalikan rentang 7-9 jam untuk dewasa', () => {
    expect(sleepTarget(30)).toEqual({ min_minutes: 420, max_minutes: 540 });
  });

  it('mempersempit batas atas untuk 65 tahun ke atas', () => {
    expect(sleepTarget(70).max_minutes).toBe(480);
  });

  /** Buktinya berbentuk pita, jadi menampilkannya sebagai satu angka memalsukan ketelitian. */
  it('selalu berupa rentang, bukan satu angka', () => {
    expect(sleepTarget(30).max_minutes).toBeGreaterThan(sleepTarget(30).min_minutes);
  });
});

describe('stepTarget', () => {
  /** Paluch dkk. 2022: manfaat mortalitas mendatar sekitar 8.000 langkah. */
  it('memakai 8.000 untuk di bawah 60 tahun', () => {
    expect(stepTarget(30).steps).toBe(8000);
  });

  it('menurunkan jadi 6.000 untuk 60 tahun ke atas', () => {
    expect(stepTarget(65).steps).toBe(6000);
  });

  /**
   * Regresi: dulu ada lapisan "tambahan untuk target berat" yang pada target
   * agresif mentok di 20.000 dan tampil sebagai "0 dari 20.000". Sekarang
   * target langkah cuma angka kesehatan, apa pun target beratnya.
   */
  it('tidak punya lapisan target berat badan lagi', () => {
    expect(stepTarget(30)).toEqual({ steps: 8000, custom: false });
  });

  /** Langkah cuma pantauan, jadi targetnya boleh milik user. */
  it('memakai angka pilihan user kalau ada, dan menandainya', () => {
    expect(stepTarget(30, 6000)).toEqual({ steps: 6000, custom: true });
    expect(stepTarget(30, null)).toEqual({ steps: 8000, custom: false });
  });
});

describe('macroTarget', () => {
  /**
   * Protein didahulukan karena dialah yang menentukan apakah berat yang hilang
   * itu lemak atau otot.
   */
  it('menaikkan protein saat defisit', () => {
    const defisit = macroTarget(2000, 80, true);
    const normal = macroTarget(2000, 80, false);

    expect(defisit.protein_g).toBeGreaterThan(normal.protein_g);
  });

  it('menurunkan protein dari berat badan', () => {
    expect(macroTarget(2000, 80, true).protein_g).toBe(144);
  });

  /** Di bawah batas ini produksi hormon dan penyerapan vitamin terganggu. */
  it('menjaga lemak di atas batas minimal fisiologis', () => {
    expect(macroTarget(1500, 80, true).fat_g).toBeGreaterThanOrEqual(64);
  });

  it('membagi habis budget kalori ke tiga makro', () => {
    const m = macroTarget(2000, 80, true);
    const total = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;

    expect(total).toBeGreaterThan(1900);
    expect(total).toBeLessThan(2100);
  });

  /** Budget sangat ketat bisa habis sebelum karbohidrat, jangan sampai negatif. */
  it('tidak pernah menganjurkan karbohidrat negatif', () => {
    expect(macroTarget(900, 120, true).carbs_g).toBeGreaterThanOrEqual(0);
  });
});

describe('dailyTargets', () => {
  const dasar = {
    weightKg: 80,
    age: 30,
    gender: 'MALE' as const,
    calorieBudget: 2000,
    isDeficit: true,
    workoutMinutes: 0,
    customStepTarget: null,
  };

  it('mengembalikan semua target sekaligus', () => {
    const hasil = dailyTargets(dasar);

    expect(hasil.water_ml).toBeGreaterThan(0);
    expect(hasil.sleep.min_minutes).toBe(420);
    expect(hasil.steps.steps).toBe(8000);
    expect(hasil.macros).not.toBeNull();
  });

  /** Tanpa goal aktif tidak ada budget kalori, jadi makro tidak bisa dihitung. */
  it('tidak mengarang makro ketika belum ada goal', () => {
    expect(dailyTargets({ ...dasar, calorieBudget: null }).macros).toBeNull();
  });
});
