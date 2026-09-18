import { describe, expect, it } from 'vitest';

import { hitungItem, jumlahkan, susunAnalisa } from './food-math.js';

/**
 * Tes untuk keluhan nyata: "saya tulis 2 pcs tapi AI menghitung 1 pcs".
 *
 * Prompt lama menyuruh model menuruti tulisan user dan model tidak nurut.
 * Sekarang jumlah porsi adalah kolom angka yang dikalikan di sini, dan model
 * tidak punya cara mengabaikannya. Tes ini yang menjaga jaminan itu.
 */

const ayam = { name: 'Ayam goreng', portions: 2, unit: 'g' as const };

const balasanModel = {
  items: [
    {
      index: 1,
      grams_per_portion: 80,
      kcal_per_100: 260,
      protein_per_100: 25,
      carbs_per_100: 3,
      fat_per_100: 16,
    },
  ],
  confidence: 'high',
};

describe('jumlah porsi dari user adalah perintah', () => {
  it('2 porsi berarti dua kali berat satu porsi, apa pun kata model', () => {
    const hasil = susunAnalisa([ayam], balasanModel, 'PHOTO');
    const item = hasil.items[0]!;

    expect(item.portions).toBe(2);
    expect(item.weight_per_portion).toBe(80);
    expect(item.amount).toBe(160);
    // 160 g × 260 kkal / 100 g
    expect(item.calories).toBe(416);
    expect(hasil.total_calories).toBe(416);
  });

  it('setengah porsi juga dihormati', () => {
    const hasil = susunAnalisa([{ ...ayam, portions: 0.5 }], balasanModel, 'PHOTO');

    expect(hasil.items[0]!.amount).toBe(40);
    expect(hasil.items[0]!.calories).toBe(104);
  });

  /**
   * Model diminta TIDAK mengalikan, tapi kalau dia tetap membalas total
   * (misal grams_per_portion sudah dikali dua), backend tidak bisa tahu.
   * Yang bisa dijamin: nama dan jumlah dari user tidak pernah tersentuh.
   */
  it('nama dan jumlah tidak pernah diambil dari model', () => {
    const modelNgaco = {
      items: [{ index: 1, name: 'Tahu', portions: 1, grams_per_portion: 80, kcal_per_100: 260 }],
    };

    const hasil = susunAnalisa([ayam], modelNgaco, 'PHOTO');

    expect(hasil.items[0]!.name).toBe('Ayam goreng');
    expect(hasil.items[0]!.portions).toBe(2);
  });
});

describe('berat per porsi', () => {
  it('berat dari user menang atas taksiran model dan ditandai USER', () => {
    const hasil = susunAnalisa([{ ...ayam, weight: 120 }], balasanModel, 'PHOTO');
    const item = hasil.items[0]!;

    expect(item.weight_per_portion).toBe(120);
    expect(item.weight_source).toBe('USER');
    expect(item.amount).toBe(240);
  });

  it('tanpa berat dari user, taksiran model dipakai dan ditandai AI', () => {
    const hasil = susunAnalisa([ayam], balasanModel, 'PHOTO');

    expect(hasil.items[0]!.weight_source).toBe('AI');
  });

  it('satuan ml ikut dibawa apa adanya', () => {
    const teh = { name: 'Teh manis', portions: 1, unit: 'ml' as const, weight: 250 };
    const balasan = { items: [{ index: 1, grams_per_portion: 250, kcal_per_100: 30 }] };

    const hasil = susunAnalisa([teh], balasan, 'TEXT');

    expect(hasil.items[0]!.unit).toBe('ml');
    expect(hasil.items[0]!.calories).toBe(75);
  });
});

describe('pencocokan balasan model ke item user', () => {
  const nasi = { name: 'Nasi putih', portions: 1, unit: 'g' as const };

  it('mencocokkan lewat index walau urutannya dibalik model', () => {
    const balasan = {
      items: [
        { index: 2, grams_per_portion: 80, kcal_per_100: 260 },
        { index: 1, grams_per_portion: 150, kcal_per_100: 130 },
      ],
    };

    const hasil = susunAnalisa([nasi, ayam], balasan, 'PHOTO');

    expect(hasil.items[0]!.weight_per_portion).toBe(150);
    expect(hasil.items[1]!.weight_per_portion).toBe(80);
  });

  it('jatuh ke urutan kalau model lupa menyertakan index', () => {
    const balasan = {
      items: [
        { grams_per_portion: 150, kcal_per_100: 130 },
        { grams_per_portion: 80, kcal_per_100: 260 },
      ],
    };

    const hasil = susunAnalisa([nasi, ayam], balasan, 'PHOTO');

    expect(hasil.items[0]!.weight_per_portion).toBe(150);
    expect(hasil.items[1]!.weight_per_portion).toBe(80);
  });

  /**
   * Item yang tidak dijawab model TIDAK diam-diam jadi nol kalori. Dia
   * ditandai, supaya user tahu itu belum ditaksir, bukan mengira makanannya
   * memang nol.
   */
  it('menandai item yang tidak dijawab model, bukan menyembunyikannya', () => {
    const balasan = { items: [{ index: 1, grams_per_portion: 150, kcal_per_100: 130 }] };

    const hasil = susunAnalisa([nasi, ayam], balasan, 'PHOTO');

    expect(hasil.items[1]!.nutrition_missing).toBe(true);
    expect(hasil.items[1]!.calories).toBe(0);
    expect(hasil.items[0]!.nutrition_missing).toBe(false);
  });
});

describe('pagar dari sifat makanannya', () => {
  it('memangkas nilai per 100 dari model yang di atas lemak murni', () => {
    const balasan = {
      items: [{ index: 1, grams_per_portion: 100, kcal_per_100: 1500, protein_per_100: 120 }],
    };

    const item = susunAnalisa([{ ...ayam, weight: 100 }], balasan, 'PHOTO').items[0]!;

    // 2 porsi × 100 g × 900 / 100, dan protein tidak bisa lebih dari 100/100
    expect(item.kcal_per_100).toBe(900);
    expect(item.calories).toBe(1800);
    expect(item.protein_g).toBe(200);
  });

  it('memangkas berat per porsi yang tidak masuk akal', () => {
    const item = hitungItem({ ...ayam, portions: 1, weight: 99_999 }, null, {
      kcal: 100,
      protein: 0,
      carbs: 0,
      fat: 0,
      missing: false,
    });

    expect(item.weight_per_portion).toBe(5000);
  });
});

describe('penjumlahan', () => {
  it('total adalah jumlah semua item, dibulatkan', () => {
    const items = [
      hitungItem({ ...ayam, weight: 100 }, null, {
        kcal: 260,
        protein: 25,
        carbs: 3,
        fat: 16,
        missing: false,
      }),
      hitungItem({ name: 'Nasi', portions: 1, unit: 'g', weight: 150 }, null, {
        kcal: 130,
        protein: 2.7,
        carbs: 28,
        fat: 0.3,
        missing: false,
      }),
    ];

    const total = jumlahkan(items);

    expect(total.total_calories).toBe(520 + 195);
    expect(total.protein_g).toBeCloseTo(50 + 4.1, 1);
  });
});

describe('kecocokan foto', () => {
  it('null tanpa foto', () => {
    expect(susunAnalisa([ayam], balasanModel, 'TEXT').photo_matches).toBeNull();
  });

  it('dianggap cocok kalau model tidak menyebut apa-apa', () => {
    expect(susunAnalisa([ayam], balasanModel, 'PHOTO').photo_matches).toBe(true);
  });

  it('membawa catatan model hanya saat tidak cocok', () => {
    const balasan = { ...balasanModel, photo_matches: false, photo_note: 'Foto terlihat soto.' };
    const hasil = susunAnalisa([ayam], balasan, 'PHOTO');

    expect(hasil.photo_matches).toBe(false);
    expect(hasil.photo_note).toBe('Foto terlihat soto.');

    const cocok = susunAnalisa([ayam], { ...balasanModel, photo_note: 'abaikan' }, 'PHOTO');
    expect(cocok.photo_note).toBeNull();
  });
});
