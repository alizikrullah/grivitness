import { describe, expect, it } from 'vitest';

import { type ObservedInput, observeTDEE, type WeightPoint } from './observed-tdee.js';

/** Rangkaian penimbangan yang turun lurus, satu kali tiap `tiapHari`. */
const timbangan = (mulaiKg: number, turunPerHari: number, hari: number, tiapHari = 3) => {
  const hasil: WeightPoint[] = [];

  for (let d = 0; d < hari; d += tiapHari) {
    const tanggal = new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10);
    hasil.push({ date: tanggal, kg: mulaiKg - turunPerHari * d });
  }

  return hasil;
};

/** Catatan makan dengan kalori tetap, menutupi `cakupan` bagian dari jendela. */
const asupan = (kkal: number, hari: number, cakupan = 1) => {
  const peta = new Map<string, number>();
  const tercatat = Math.floor(hari * cakupan);

  for (let d = 0; d < tercatat; d++) {
    peta.set(new Date(Date.UTC(2026, 0, 1) + d * 86_400_000).toISOString().slice(0, 10), kkal);
  }

  return peta;
};

const dasar = (ubah: Partial<ObservedInput> = {}): ObservedInput => ({
  weights: timbangan(85, 1.2 / 21, 21),
  intakeByDate: asupan(1900, 21),
  days: 21,
  estimated: 2685,
  ...ubah,
});

describe('observeTDEE', () => {
  /**
   * Contoh yang jadi alasan seluruh berkas ini ada.
   *
   * Makan 1900 kkal selama 21 hari sambil turun 1,2 kg berarti TDEE-nya
   * 1900 + (1,2/21) x 7700 = 2340, bukan 2685 seperti tebakan rumus.
   */
  it('menghitung TDEE dari asupan dan laju penurunan', () => {
    const hasil = observeTDEE(dasar());

    expect(hasil.measured).toBe(2340);
    expect(hasil.reason).toBeNull();
  });

  it('mengembalikan laju mingguan dari regresi', () => {
    expect(observeTDEE(dasar()).weekly_rate_kg).toBeCloseTo(-0.4, 1);
  });

  /**
   * Hasilnya dicampur, bukan menggantikan. Melompat penuh ke pengukuran tiga
   * minggu akan membuat jatah kalori berayun mengikuti fluktuasi air.
   */
  it('mencampur hasil pengukuran dengan estimasi sesuai keyakinan', () => {
    const hasil = observeTDEE(dasar());

    expect(hasil.confidence).toBeGreaterThan(0);
    expect(hasil.confidence).toBeLessThanOrEqual(0.85);
    expect(hasil.tdee).toBeGreaterThan(hasil.measured!);
    expect(hasil.tdee).toBeLessThan(hasil.estimated);
  });

  it('makin panjang dan rapat datanya, makin besar bobot pengukurannya', () => {
    const pendek = observeTDEE(dasar());
    const panjang = observeTDEE(
      dasar({ weights: timbangan(85, 1.2 / 21, 42), intakeByDate: asupan(1900, 42), days: 42 }),
    );

    expect(panjang.confidence).toBeGreaterThan(pendek.confidence);
    expect(Math.abs(panjang.tdee - panjang.measured!)).toBeLessThan(
      Math.abs(pendek.tdee - pendek.measured!),
    );
  });

  /** Tidak pernah menyerahkan angkanya sepenuhnya ke kualitas catatan makan. */
  it('tidak pernah membuang estimasi rumus sepenuhnya', () => {
    const hasil = observeTDEE(
      dasar({
        weights: timbangan(85, 1.2 / 21, 90, 1),
        intakeByDate: asupan(1900, 90),
        days: 90,
      }),
    );

    expect(hasil.confidence).toBeLessThanOrEqual(0.85);
    expect(hasil.tdee).not.toBe(hasil.measured);
  });

  describe('menolak data yang belum layak', () => {
    it('jendela terlalu pendek', () => {
      const hasil = observeTDEE(
        dasar({ weights: timbangan(85, 0.05, 10), intakeByDate: asupan(1900, 10), days: 10 }),
      );

      expect(hasil.reason).toBe('BELUM_CUKUP_HARI');
      expect(hasil.measured).toBeNull();
      expect(hasil.tdee).toBe(hasil.estimated);
    });

    it('penimbangan terlalu sedikit', () => {
      const hasil = observeTDEE(dasar({ weights: timbangan(85, 0.05, 21, 7) }));

      expect(hasil.reason).toBe('BELUM_CUKUP_TIMBANGAN');
    });

    /** Enam penimbangan dalam tiga hari tidak memberi tahu apa-apa soal tren. */
    it('penimbangan menumpuk di rentang yang terlalu sempit', () => {
      const rapat: WeightPoint[] = [
        { date: '2026-01-01', kg: 85.0 },
        { date: '2026-01-02', kg: 84.9 },
        { date: '2026-01-03', kg: 84.8 },
        { date: '2026-01-04', kg: 84.9 },
        { date: '2026-01-05', kg: 84.7 },
        { date: '2026-01-06', kg: 84.8 },
      ];

      expect(observeTDEE(dasar({ weights: rapat })).reason).toBe('RENTANG_TIMBANG_PENDEK');
    });

    /**
     * Ini pagar yang paling penting. Catatan makan bolong-bolong membuat rata
     * -rata hariannya omong kosong, dan lebih baik menolak menghitung daripada
     * menampilkan angka yang terlihat resmi padahal karangan.
     */
    it('catatan makan tidak menutupi cukup banyak hari', () => {
      const hasil = observeTDEE(dasar({ intakeByDate: asupan(1900, 21, 0.5) }));

      expect(hasil.reason).toBe('CATATAN_MAKAN_KURANG');
      expect(hasil.tdee).toBe(hasil.estimated);
    });

    /** Hasil ekstrem jauh lebih mungkin berarti datanya kacau. */
    it('hasilnya di luar batas kewajaran terhadap rumus', () => {
      const hasil = observeTDEE(dasar({ intakeByDate: asupan(600, 21) }));

      expect(hasil.reason).toBe('HASIL_TIDAK_WAJAR');
      expect(hasil.tdee).toBe(hasil.estimated);
    });
  });

  /**
   * Regresi dipakai justru supaya fluktuasi air tidak menentukan segalanya.
   * Menambah satu kilo di penimbangan terakhir tidak boleh membalikkan
   * kesimpulan seperti kalau cuma dua titik ujung yang dipakai.
   */
  it('tahan terhadap satu penimbangan yang meleset', () => {
    const bersih = timbangan(85, 1.2 / 21, 21);

    // Satu kilo air di penimbangan TERAKHIR, posisi paling merusak, karena di
    // ujung rentang pengaruhnya terhadap kemiringan garis paling besar.
    const kacau = bersih.map((w, i) => (i === bersih.length - 1 ? { ...w, kg: w.kg + 1 } : w));

    const a = observeTDEE(dasar({ weights: bersih }));
    const b = observeTDEE(dasar({ weights: kacau }));

    /**
     * Pembandingnya cara naif yang cuma memakai penimbangan pertama dan
     * terakhir. Dibandingkan begini, bukan terhadap ambang karangan, supaya yang
     * diuji benar-benar sifat yang diklaim: regresi memakai SEMUA titik sehingga
     * satu kesalahan ikut diredam titik-titik lain.
     */
    const ujung = (w: WeightPoint[]) => {
      const hari = (w.length - 1) * 3;
      return 1900 + ((w[0]!.kg - w[w.length - 1]!.kg) / hari) * 7700;
    };

    const geserRegresi = Math.abs(b.measured! - a.measured!);
    const geserUjung = Math.abs(ujung(kacau) - ujung(bersih));

    expect(geserRegresi).toBeLessThan(geserUjung);
  });

  it('bekerja juga untuk berat yang naik', () => {
    const hasil = observeTDEE(
      dasar({ weights: timbangan(60, -0.5 / 21, 21), intakeByDate: asupan(2800, 21) }),
    );

    expect(hasil.weekly_rate_kg).toBeGreaterThan(0);
    // Naik berarti asupan melebihi pengeluaran, jadi TDEE ada di bawah asupan.
    expect(hasil.measured).toBeLessThan(2800);
  });

  /** Berat yang diam di tempat berarti asupan persis sama dengan pengeluaran. */
  it('berat stabil berarti TDEE sama dengan asupan', () => {
    const stabil = timbangan(85, 0, 21);
    const hasil = observeTDEE(dasar({ weights: stabil, intakeByDate: asupan(2400, 21) }));

    expect(hasil.measured).toBe(2400);
  });
});
