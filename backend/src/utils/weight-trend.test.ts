import { describe, expect, it } from 'vitest';

import { lajuPerHari, type WeightPoint } from './weight-trend.js';

/** Rangkaian penimbangan yang turun lurus, satu kali tiap `tiapHari`. */
const timbangan = (mulaiKg: number, turunPerHari: number, hari: number, tiapHari = 3) => {
  const hasil: WeightPoint[] = [];

  for (let d = 0; d < hari; d += tiapHari) {
    const tanggal = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    hasil.push({ date: tanggal, kg: mulaiKg - turunPerHari * d });
  }

  return hasil;
};

describe('lajuPerHari', () => {
  it('membaca kemiringan garis lurus, urutan masukan bebas', () => {
    const turun = timbangan(85, 0.05, 21).reverse();

    expect(lajuPerHari(turun)).toBeCloseTo(-0.05, 6);
  });

  it('berat yang naik bernilai positif, yang diam nol', () => {
    expect(lajuPerHari(timbangan(60, -0.02, 21))).toBeCloseTo(0.02, 6);
    expect(lajuPerHari(timbangan(85, 0, 21))).toBe(0);
  });

  it('kurang dari dua penimbangan, atau semuanya satu tanggal, tidak punya tren', () => {
    expect(lajuPerHari([{ date: '2026-01-01', kg: 85 }])).toBeNull();
    expect(
      lajuPerHari([
        { date: '2026-01-01', kg: 85 },
        { date: '2026-01-01', kg: 86 },
      ]),
    ).toBeNull();
  });

  /**
   * Regresi dipakai justru supaya fluktuasi air tidak menentukan segalanya.
   * Satu kilo air di penimbangan TERAKHIR, posisi paling merusak, harus
   * menggeser hasilnya lebih sedikit daripada cara naif dua titik ujung.
   */
  it('tahan terhadap satu penimbangan yang meleset', () => {
    const bersih = timbangan(85, 1.2 / 21, 21);
    const kacau = bersih.map((w, i) => (i === bersih.length - 1 ? { ...w, kg: w.kg + 1 } : w));

    const ujung = (w: WeightPoint[]) => (w[w.length - 1]!.kg - w[0]!.kg) / ((w.length - 1) * 3);

    const geserRegresi = Math.abs(lajuPerHari(kacau)! - lajuPerHari(bersih)!);
    const geserUjung = Math.abs(ujung(kacau) - ujung(bersih));

    expect(geserRegresi).toBeLessThan(geserUjung);
  });
});
