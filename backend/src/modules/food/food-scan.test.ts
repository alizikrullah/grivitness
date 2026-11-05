import { describe, expect, it } from 'vitest';

import type { FoodItemInput } from '../../utils/food-math.js';
import { type FoodMemory, susunIngatan } from './food-memory.js';
import { foodScanPrompt, hasilTebakan, hasilTertulis } from './food-scan.js';

/**
 * Foto makanan mengisi form, user yang memeriksa. Tes ini menjaga aturan
 * pencocokan ke catatan: nama persis tersambung otomatis, varian cuma jadi
 * saran. Nasi Goreng Teri bukan Nasi Goreng, walau kata depannya sama.
 */

const catatan = (
  name: string,
  kkal: number,
  ekstra: Partial<{ unit: 'g' | 'ml'; weight: number; label: { kcal: number } | null }> = {},
) => ({
  name,
  portions: 1,
  unit: ekstra.unit ?? 'g',
  weight_per_portion: ekstra.weight ?? 250,
  weight_source: 'USER',
  nutrition_source: ekstra.label ? 'LABEL' : 'AI',
  label: ekstra.label ?? null,
  amount: ekstra.weight ?? 250,
  kcal_per_100: kkal,
  protein_per_100: 6,
  carbs_per_100: 28,
  fat_per_100: 5,
  sugar_per_100: 1,
  calories: kkal,
  protein_g: 6,
  carbs_g: 28,
  fat_g: 5,
  sugar_g: 1,
  sugar_source: 'AI',
  nutrition_missing: false,
});

const peta = (...items: ReturnType<typeof catatan>[]): Map<string, FoodMemory> =>
  susunIngatan([
    {
      ai_analysis: { user_edited: false, items },
      logged_at: '2026-11-01T05:00:00.000Z',
      created_at: '2026-11-01T05:00:00.000Z',
    },
  ]);

const dariModel = (name: string, ekstra: Record<string, unknown> = {}) => ({
  name,
  portions: 1,
  unit: 'g',
  grams_per_portion: 300,
  kcal_per_100: 190,
  protein_per_100: 7,
  carbs_per_100: 24,
  fat_per_100: 8,
  sugar_per_100: 2,
  ...ekstra,
});

describe('hasilTebakan: nama persis otomatis dari catatan', () => {
  const ingatan = peta(catatan('Nasi Goreng', 170), catatan('Nasi putih', 130));

  it('nama yang persis sama tersambung, berat tetap dari foto', () => {
    const [baris] = hasilTebakan({ items: [dariModel('Nasi putih')] }, ingatan).items;

    expect(baris?.memory?.name).toBe('Nasi putih');
    expect(baris?.memory?.kcal_per_100).toBe(130);
    expect(baris?.weight).toBe(300);
    expect(baris?.guessed).toBe(true);
    expect(baris?.similar).toEqual([]);
  });

  it('huruf besar kecil dan tanda baca tidak dianggap beda, ejaan catatan yang dipakai', () => {
    const [baris] = hasilTebakan({ items: [dariModel('nasi  PUTIH.')] }, ingatan).items;

    expect(baris?.name).toBe('Nasi putih');
    expect(baris?.memory).not.toBeNull();
  });

  it('satuan beda bukan makanan yang sama', () => {
    const [baris] = hasilTebakan(
      { items: [dariModel('Nasi putih', { unit: 'ml' })] },
      ingatan,
    ).items;

    expect(baris?.memory).toBeNull();
  });

  it('nama yang sudah di-Lupakan tidak ada di ingatan, jadi memakai taksiran AI', () => {
    const [baris] = hasilTebakan({ items: [dariModel('Nasi putih')] }, new Map()).items;

    expect(baris?.memory).toBeNull();
    expect(baris?.estimate?.kcal_per_100).toBe(190);
  });
});

describe('hasilTebakan: varian cuma jadi saran', () => {
  const ingatan = peta(catatan('Nasi Goreng', 170));

  it.each(['Nasi Goreng Teri', 'Nasi Goreng Ati Ampela', 'Nasi Goreng Hijau'])(
    '%s tidak memakai angka Nasi Goreng, tapi Nasi Goreng ditawarkan',
    (nama) => {
      const [baris] = hasilTebakan({ items: [dariModel(nama)] }, ingatan).items;

      expect(baris?.name).toBe(nama);
      expect(baris?.memory).toBeNull();
      expect(baris?.estimate?.kcal_per_100).toBe(190);
      expect(baris?.similar.map((s) => s.name)).toEqual(['Nasi Goreng']);
    },
  );

  it('arah sebaliknya: AI menulis Nasi Goreng, catatan cuma punya yang lebih lengkap', () => {
    const [baris] = hasilTebakan(
      { items: [dariModel('Nasi Goreng')] },
      peta(catatan('Nasi Goreng Teri', 200)),
    ).items;

    expect(baris?.memory).toBeNull();
    expect(baris?.similar.map((s) => s.name)).toEqual(['Nasi Goreng Teri']);
  });

  it('catatan yang tidak punya kata yang sama tidak ditawarkan', () => {
    const [baris] = hasilTebakan({ items: [dariModel('Soto ayam')] }, ingatan).items;

    expect(baris?.similar).toEqual([]);
  });
});

describe('hasilTebakan: balasan model dibaca hati-hati', () => {
  it('yang bukan makanan dan yang tanpa nama dibuang', () => {
    const { items } = hasilTebakan(
      { items: [null, 'nasi', [], { name: '  ' }, dariModel('Tempe goreng')] },
      new Map(),
    );

    expect(items.map((i) => i.name)).toEqual(['Tempe goreng']);
  });

  it('daftar kosong atau bukan daftar tidak meledak', () => {
    expect(hasilTebakan({}, new Map()).items).toEqual([]);
    expect(hasilTebakan({ items: 'tidak ada' }, new Map()).items).toEqual([]);
  });

  it('porsi yang tidak masuk akal jadi 1, berat yang tidak masuk akal kosong', () => {
    const [baris] = hasilTebakan(
      { items: [dariModel('Tempe goreng', { portions: 0, grams_per_portion: 9000 })] },
      new Map(),
    ).items;

    expect(baris?.portions).toBe(1);
    expect(baris?.weight).toBeNull();
    expect(baris?.estimate?.grams_per_portion).toBeUndefined();
  });

  it('berat dibulatkan, karena dibandingkan lagi saat Simpan', () => {
    const [baris] = hasilTebakan(
      { items: [dariModel('Tempe goreng', { grams_per_portion: 42.6 })] },
      new Map(),
    ).items;

    expect(baris?.weight).toBe(43);
    expect(baris?.estimate?.grams_per_portion).toBe(43);
  });

  it('pagar gizi yang sama dengan jalur simpan, dan gula tidak melebihi karbo', () => {
    const [baris] = hasilTebakan(
      { items: [dariModel('Tempe goreng', { kcal_per_100: 4000, sugar_per_100: 90 })] },
      new Map(),
    ).items;

    expect(baris?.estimate?.kcal_per_100).toBe(900);
    expect(baris?.estimate?.sugar_per_100).toBe(24);
  });

  it('tanpa kalori taksirannya kosong, bukan nol', () => {
    const [baris] = hasilTebakan(
      { items: [{ name: 'Tempe goreng', grams_per_portion: 50 }] },
      new Map(),
    ).items;

    expect(baris?.estimate).toBeNull();
    expect(baris?.weight).toBe(50);
  });

  it('dibatasi 20 baris, sama dengan batas satu sesi makan', () => {
    const items = Array.from({ length: 25 }, (_, i) => dariModel('Lauk ' + String(i)));

    expect(hasilTebakan({ items }, new Map()).items).toHaveLength(20);
  });
});

describe('hasilTertulis: nama dan porsi tulisan user tidak disentuh', () => {
  const tertulis: FoodItemInput[] = [
    { name: 'Ayam geprek', portions: 2, unit: 'g' },
    { name: 'Es teh', portions: 1, unit: 'ml', weight: 400 },
  ];

  const balasan = {
    items: [
      { index: 1, grams_per_portion: 120, kcal_per_100: 280, protein_per_100: 20 },
      { index: 2, grams_per_portion: 300, kcal_per_100: 30, sugar_per_100: 7 },
    ],
    confidence: 'medium',
    photo_matches: true,
  };

  it('nama, porsi, dan urutan tetap, model cuma mengisi yang kosong', () => {
    const { items } = hasilTertulis(tertulis, [null, null], balasan);

    expect(items.map((i) => [i.name, i.portions])).toEqual([
      ['Ayam geprek', 2],
      ['Es teh', 1],
    ]);
    expect(items[0]?.weight).toBe(120);
    expect(items[0]?.guessed).toBe(false);
  });

  it('berat yang ditulis user tidak ditimpa dan tidak ikut di taksiran', () => {
    const { items } = hasilTertulis(tertulis, [null, null], balasan);

    expect(items[1]?.weight).toBeNull();
    expect(items[1]?.estimate?.grams_per_portion).toBeUndefined();
    expect(items[1]?.estimate?.kcal_per_100).toBe(30);
  });

  it('item yang sudah tertutup kemasan tidak diberi taksiran', () => {
    const { items } = hasilTertulis(
      [{ name: 'Biskuat', portions: 1, unit: 'g', label: { kcal: 95, sugar_g: 4 } }],
      [null],
      { items: [], photo_matches: true },
    );

    expect(items[0]?.estimate).toBeNull();
    expect(items[0]?.weight).toBeNull();
  });

  it('tanda foto salah lampir ikut sampai ke form', () => {
    const hasil = hasilTertulis(tertulis, [null, null], {
      ...balasan,
      photo_matches: false,
      photo_note: 'Foto menampilkan soto.',
    });

    expect(hasil.photo_matches).toBe(false);
    expect(hasil.photo_note).toBe('Foto menampilkan soto.');
  });

  it('model tidak dipanggil berarti foto tidak diperiksa, bukan cocok', () => {
    expect(hasilTertulis(tertulis, [null, null], {}).photo_matches).toBeNull();
  });
});

describe('foodScanPrompt', () => {
  it('menyebut nama catatan dan melarang varian disamakan', () => {
    const prompt = foodScanPrompt(['Nasi Goreng', 'Tempe goreng']);

    expect(prompt).toContain('- Nasi Goreng');
    expect(prompt).toContain('"Nasi Goreng Teri", not "Nasi Goreng"');
  });

  it('tanpa catatan tetap utuh', () => {
    expect(foodScanPrompt([])).toContain('(none)');
  });
});
