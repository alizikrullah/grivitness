import { describe, expect, it } from 'vitest';

import { hitungItem, jumlahkan, kebutuhanModel, perluModel, susunAnalisa } from './food-math.js';

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

/**
 * Angka dari kemasan menang mutlak atas taksiran model. Indomie yang tertulis
 * 350 kkal per bungkus tidak boleh jadi 380 cuma karena model menebak begitu.
 */
describe('nilai gizi dari kemasan', () => {
  const indomie = {
    name: 'Indomie goreng',
    portions: 2,
    unit: 'g' as const,
    weight: 85,
    label: { kcal: 350, protein_g: 8, carbs_g: 54, fat_g: 12 },
  };

  it('memakai kalori kemasan per porsi dikali jumlah porsi, mengabaikan model', () => {
    const balasan = { items: [{ index: 1, grams_per_portion: 85, kcal_per_100: 447 }] };
    const item = susunAnalisa([indomie], balasan, 'TEXT').items[0]!;

    expect(item.nutrition_source).toBe('LABEL');
    expect(item.calories).toBe(700);
    expect(item.protein_g).toBe(16);
    expect(item.carbs_g).toBe(108);
    expect(item.fat_g).toBe(24);
    expect(item.nutrition_missing).toBe(false);
  });

  it('menurunkan balik nilai per 100 dari kemasan supaya rinciannya konsisten', () => {
    const item = susunAnalisa([indomie], {}, 'TEXT').items[0]!;

    // 350 kkal / 85 g × 100 = 411.8
    expect(item.kcal_per_100).toBe(412);
  });

  it('tidak butuh berat: kalori tetap benar walau berat kosong dan model diam', () => {
    const tanpaBerat = { ...indomie, weight: undefined };
    const item = susunAnalisa([tanpaBerat], {}, 'TEXT').items[0]!;

    expect(item.calories).toBe(700);
    expect(item.weight_per_portion).toBe(0);
    expect(item.kcal_per_100).toBe(0);
  });

  it('makro yang tidak diisi dianggap nol, bukan ditebak model', () => {
    const cumaKalori = { ...indomie, label: { kcal: 350 } };
    const balasan = { items: [{ index: 1, kcal_per_100: 447, protein_per_100: 99 }] };
    const item = susunAnalisa([cumaKalori], balasan, 'TEXT').items[0]!;

    expect(item.calories).toBe(700);
    expect(item.protein_g).toBe(0);
  });

  it('model tidak perlu dipanggil kalau semua item dari kemasan', () => {
    expect(perluModel([indomie])).toBe(false);
    expect(perluModel([indomie, { name: 'Telur', portions: 1, unit: 'g' }])).toBe(true);
  });
});

describe('ingatan makanan: nama yang sama memakai angka yang sama', () => {
  const kosong = { kcal: 0, protein: 0, carbs: 0, fat: 0, missing: true };
  const nescafe = { name: 'Nescafe Classic bubuk', portions: 1, unit: 'g' as const };

  const ingatanAI = {
    weight_per_portion: 8,
    label: null,
    per100: { kcal: 350, protein: 12, carbs: 41, fat: 0.5, missing: false },
  };

  it('memakai nilai per 100 dari ingatan, bukan dari model, dan menandai PREVIOUS', () => {
    const modelBerbeda = { kcal: 100, protein: 1, carbs: 1, fat: 1, missing: false };
    const hasil = hitungItem({ ...nescafe, weight: 8 }, 8, modelBerbeda, ingatanAI);

    expect(hasil.kcal_per_100).toBe(350);
    expect(hasil.calories).toBe(28);
    expect(hasil.nutrition_source).toBe('PREVIOUS');
    expect(hasil.nutrition_missing).toBe(false);
  });

  it('berat yang dikosongkan user diisi dari ingatan, bukan dari model', () => {
    const hasil = hitungItem(nescafe, 50, kosong, ingatanAI);

    expect(hasil.weight_per_portion).toBe(8);
    expect(hasil.calories).toBe(28);
  });

  it('berat dari user tetap menang atas ingatan', () => {
    const hasil = hitungItem({ ...nescafe, weight: 12 }, null, kosong, ingatanAI);

    expect(hasil.weight_per_portion).toBe(12);
    expect(hasil.weight_source).toBe('USER');
    expect(hasil.calories).toBe(42);
  });

  it('kemasan yang pernah dipakai dihitung seperti label tapi ditandai PREVIOUS', () => {
    const ingatanLabel = {
      weight_per_portion: null,
      label: { kcal: 28, protein_g: 1 },
      per100: { kcal: 350, protein: 12, carbs: 41, fat: 0.5, missing: false },
    };
    const hasil = hitungItem({ ...nescafe, portions: 2 }, null, kosong, ingatanLabel);

    expect(hasil.calories).toBe(56);
    expect(hasil.protein_g).toBe(2);
    expect(hasil.nutrition_source).toBe('PREVIOUS');
    expect(hasil.label).toEqual({ kcal: 28, protein_g: 1, carbs_g: 0, fat_g: 0 });
  });

  it('label yang diketik user hari ini menang atas ingatan', () => {
    const hasil = hitungItem({ ...nescafe, label: { kcal: 30 } }, null, kosong, ingatanAI);

    expect(hasil.calories).toBe(30);
    expect(hasil.nutrition_source).toBe('LABEL');
  });

  it('koreksi mempertahankan asal PREVIOUS, tidak diam-diam jadi AI', () => {
    const hasil = hitungItem({ ...nescafe, weight: 8 }, null, ingatanAI.per100, null, 'PREVIOUS');
    expect(hasil.nutrition_source).toBe('PREVIOUS');
  });

  it('model tidak dipanggil kalau semua item tertutup ingatan', () => {
    expect(perluModel([nescafe], [ingatanAI], false)).toBe(false);
    expect(perluModel([nescafe], [ingatanAI], true)).toBe(false);
  });

  it('dengan foto, model tetap dipanggil kalau ingatan tidak menyimpan berat', () => {
    const tanpaBerat = { ...ingatanAI, weight_per_portion: null };
    expect(perluModel([nescafe], [tanpaBerat], true)).toBe(true);
    // Tanpa foto berat tidak bisa ditaksir, jadi bukan alasan memanggil model.
    expect(perluModel([nescafe], [tanpaBerat], false)).toBe(false);
  });

  it('kebutuhan model per item: gizi dan berat dinilai terpisah', () => {
    expect(kebutuhanModel(nescafe, null)).toEqual({ gizi: true, berat: true });
    expect(kebutuhanModel(nescafe, ingatanAI)).toEqual({ gizi: false, berat: false });
    expect(kebutuhanModel({ ...nescafe, weight: 8 }, null)).toEqual({ gizi: true, berat: false });
    expect(kebutuhanModel({ ...nescafe, label: { kcal: 28 } }, null)).toEqual({
      gizi: false,
      berat: false,
    });
  });

  it('susunAnalisa meneruskan ingatan per item, item lain tetap dari model', () => {
    const analisa = susunAnalisa(
      [nescafe, { name: 'Roti', portions: 1, unit: 'g' }],
      {
        items: [
          { index: 1, grams_per_portion: 99, kcal_per_100: 1 },
          { index: 2, grams_per_portion: 30, kcal_per_100: 250 },
        ],
      },
      'TEXT',
      [ingatanAI, null],
    );

    expect(analisa.items[0]?.nutrition_source).toBe('PREVIOUS');
    expect(analisa.items[0]?.calories).toBe(28);
    expect(analisa.items[1]?.nutrition_source).toBe('AI');
    expect(analisa.items[1]?.calories).toBe(75);
    expect(analisa.total_calories).toBe(103);
  });
});
