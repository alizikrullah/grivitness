import { describe, expect, it } from 'vitest';

import { cocokkanIngatan, normalisasiNama, saranMakanan, susunIngatan } from './food-memory.js';

/**
 * Kasus nyatanya: "Americano nescafe dengan stevia" dicatat dua hari, dapat 21
 * kkal dari jalur foto dan 7 kkal dari jalur teks. Ingatan yang memastikan
 * nama yang sama memakai angka yang sama, dan tes ini menjaga aturan
 * prioritasnya.
 */

const item = (
  name: string,
  kkal: number,
  ekstra: Partial<{
    unit: 'g' | 'ml';
    weight: number;
    label: { kcal: number } | null;
    missing: boolean;
  }> = {},
) => ({
  name,
  portions: 1,
  unit: ekstra.unit ?? 'g',
  weight_per_portion: ekstra.weight ?? 100,
  weight_source: 'USER',
  nutrition_source: ekstra.label ? 'LABEL' : 'AI',
  label: ekstra.label ?? null,
  amount: ekstra.weight ?? 100,
  kcal_per_100: kkal,
  protein_per_100: 1,
  carbs_per_100: 1,
  fat_per_100: 1,
  calories: kkal,
  protein_g: 1,
  carbs_g: 1,
  fat_g: 1,
  nutrition_missing: ekstra.missing ?? false,
});

const log = (
  logged_at: string,
  items: ReturnType<typeof item>[],
  user_edited = false,
): { ai_analysis: Record<string, unknown>; logged_at: string } => ({
  logged_at,
  ai_analysis: { source: 'TEXT', items, user_edited },
});

describe('normalisasiNama', () => {
  it('menyamakan huruf besar, tanda baca, dan spasi ganda', () => {
    expect(normalisasiNama('Nescafe Classic  bubuk.')).toBe('nescafe classic bubuk');
    expect(normalisasiNama('  AMERICANO, nescafe ')).toBe('americano nescafe');
  });
});

describe('susunIngatan', () => {
  it('memakai catatan paling baru untuk peringkat yang sama', () => {
    const peta = susunIngatan([
      log('2026-09-21T06:00:00Z', [item('Americano', 3)]),
      log('2026-09-20T16:00:00Z', [item('americano', 1)]),
    ]);

    expect(peta.get('americano|g')?.per100.kcal).toBe(3);
    expect(peta.get('americano|g')?.times).toBe(2);
  });

  it('kemasan menang atas taksiran AI walau lebih lama', () => {
    const peta = susunIngatan([
      log('2026-09-21T06:00:00Z', [item('Nescafe', 3)]),
      log('2026-09-10T06:00:00Z', [item('Nescafe', 350, { label: { kcal: 28 }, weight: 8 })]),
    ]);

    const m = peta.get('nescafe|g');
    expect(m?.origin).toBe('LABEL');
    expect(m?.label).toEqual({ kcal: 28 });
    expect(m?.weight_per_portion).toBe(8);
  });

  it('koreksi user menang atas taksiran AI, kalah dari kemasan', () => {
    const peta = susunIngatan([
      log('2026-09-21T06:00:00Z', [item('Telur', 140)]),
      log('2026-09-15T06:00:00Z', [item('Telur', 155)], true),
    ]);
    expect(peta.get('telur|g')?.origin).toBe('EDITED');
    expect(peta.get('telur|g')?.per100.kcal).toBe(155);
  });

  it('item yang gizinya hilang tidak diingat', () => {
    const peta = susunIngatan([
      log('2026-09-21T06:00:00Z', [item('Misterius', 0, { missing: true })]),
    ]);
    expect(peta.size).toBe(0);
  });

  it('satuan berbeda adalah ingatan berbeda', () => {
    const peta = susunIngatan([
      log('2026-09-21T06:00:00Z', [item('Susu', 42, { unit: 'ml' }), item('Susu', 496)]),
    ]);
    expect(peta.get('susu|ml')?.per100.kcal).toBe(42);
    expect(peta.get('susu|g')?.per100.kcal).toBe(496);
  });

  it('mengabaikan ai_analysis lama yang tidak punya daftar item', () => {
    const peta = susunIngatan([{ logged_at: '2026-09-01T00:00:00Z', ai_analysis: { total: 1 } }]);
    expect(peta.size).toBe(0);
  });
});

describe('cocokkanIngatan', () => {
  it('mencocokkan nama yang dinormalisasi dan satuan yang sama', () => {
    const peta = susunIngatan([log('2026-09-21T06:00:00Z', [item('Nescafe Classic bubuk', 350)])]);
    const hasil = cocokkanIngatan(peta, [
      { name: 'nescafe classic  BUBUK', portions: 1, unit: 'g' },
      { name: 'Nescafe Classic bubuk', portions: 1, unit: 'ml' },
      { name: 'Roti', portions: 1, unit: 'g' },
    ]);

    expect(hasil[0]?.per100.kcal).toBe(350);
    expect(hasil[1]).toBeNull();
    expect(hasil[2]).toBeNull();
  });
});

describe('saranMakanan', () => {
  const peta = susunIngatan([
    log('2026-09-21T06:00:00Z', [item('Nescafe Classic bubuk', 350), item('Nasi putih', 130)]),
    log('2026-09-20T06:00:00Z', [item('Nasi putih', 130), item('Telur rebus', 155)]),
    log('2026-09-19T06:00:00Z', [item('Nasi putih', 130), item('Tempe goreng', 190)]),
  ]);

  it('kosong berarti yang paling sering dicatat lebih dulu', () => {
    const nama = saranMakanan(peta, '').map((m) => m.name);
    expect(nama[0]).toBe('Nasi putih');
    expect(nama).toHaveLength(4);
  });

  it('yang diawali kata pencarian naik ke atas', () => {
    const nama = saranMakanan(peta, 'te').map((m) => m.name);
    expect(nama[0]).toBe('Telur rebus');
    expect(nama).toContain('Tempe goreng');
    expect(nama).not.toContain('Nasi putih');
  });

  it('mencari di tengah nama juga', () => {
    expect(saranMakanan(peta, 'classic').map((m) => m.name)).toEqual(['Nescafe Classic bubuk']);
  });
});

describe('salinan tidak mengalahkan sumbernya', () => {
  it('nama tampilan tetap dari catatan asli walau salinan PREVIOUS lebih baru', () => {
    const salinan = {
      ...item('nescafe classic  bubuk', 350, { label: { kcal: 28 } }),
      nutrition_source: 'PREVIOUS',
    };
    const peta = susunIngatan([
      log('2026-09-22T06:00:00Z', [salinan]),
      log('2026-09-21T06:00:00Z', [item('Nescafe Classic bubuk', 350, { label: { kcal: 28 } })]),
    ]);

    const m = peta.get('nescafe classic bubuk|g');
    expect(m?.name).toBe('Nescafe Classic bubuk');
    expect(m?.times).toBe(2);
  });

  it('salinan tetap dipakai kalau cuma itu yang ada', () => {
    const salinan = { ...item('Roti', 250), nutrition_source: 'PREVIOUS' };
    const peta = susunIngatan([log('2026-09-22T06:00:00Z', [salinan])]);
    expect(peta.get('roti|g')?.per100.kcal).toBe(250);
  });
});
