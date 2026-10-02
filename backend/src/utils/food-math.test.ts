import { describe, expect, it } from 'vitest';

import {
  gulaDariRasio,
  hitungItem,
  type IngatanItem,
  jumlahkan,
  kebutuhanModel,
  labelTidakCocok,
  type Per100,
  perluModel,
  putuskan,
  susunAnalisa,
} from './food-math.js';

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
      sugar_per_100: 0.5,
    },
  ],
  confidence: 'high',
};

const per100 = (kcal: number, ekstra: Partial<Per100> = {}): Per100 => ({
  kcal,
  protein: 0,
  carbs: 0,
  fat: 0,
  sugar: null,
  missing: false,
  ...ekstra,
});

/** hitungItem untuk item tanpa sumber lain selain nilai per 100 ini. */
const dariPer100 = (item: Parameters<typeof putuskan>[0], gizi: Per100) =>
  hitungItem(item, putuskan(item, { model: { berat: null, per100: gizi } }));

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
    const item = dariPer100({ ...ayam, portions: 1, weight: 99_999 }, per100(100));
    expect(item.weight_per_portion).toBe(5000);
  });
});

describe('penjumlahan', () => {
  it('total adalah jumlah semua item, dibulatkan', () => {
    const items = [
      dariPer100({ ...ayam, weight: 100 }, per100(260, { protein: 25, carbs: 3, fat: 16 })),
      dariPer100(
        { name: 'Nasi', portions: 1, unit: 'g', weight: 150 },
        per100(130, { protein: 2.7, carbs: 28, fat: 0.3, sugar: 0.1 }),
      ),
    ];

    const total = jumlahkan(items);

    expect(total.total_calories).toBe(520 + 195);
    expect(total.protein_g).toBeCloseTo(50 + 4.1, 1);
    expect(total.sugar_g).toBeCloseTo(0.2, 1);
  });

  it('item lama tanpa kolom gula dihitung nol, bukan NaN', () => {
    const lama = { ...dariPer100({ ...ayam, weight: 100 }, per100(260)) } as Record<
      string,
      unknown
    >;
    delete lama.sugar_g;

    expect(jumlahkan([lama as never]).sugar_g).toBe(0);
  });
});

describe('kecocokan foto', () => {
  it('null tanpa foto', () => {
    expect(susunAnalisa([ayam], balasanModel, 'TEXT').photo_matches).toBeNull();
  });

  it('dianggap cocok kalau model melihat foto dan tidak menyebut apa-apa', () => {
    expect(susunAnalisa([ayam], balasanModel, 'PHOTO').photo_matches).toBe(true);
  });

  /**
   * Celah 5: semua item tertutup kemasan atau catatan, model tidak dipanggil,
   * dan foto dulu ditandai "cocok" padahal tidak ada yang pernah melihatnya.
   */
  it('null, bukan cocok, kalau model tidak dipanggil sama sekali', () => {
    const hasil = susunAnalisa([{ ...ayam, label: { kcal: 300, sugar_g: 0 } }], {}, 'PHOTO', {
      modelDipanggil: false,
    });
    expect(hasil.photo_matches).toBeNull();
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
    label: { kcal: 350, protein_g: 8, carbs_g: 54, fat_g: 12, sugar_g: 7 },
  };

  it('memakai kalori kemasan per porsi dikali jumlah porsi, mengabaikan model', () => {
    const balasan = { items: [{ index: 1, grams_per_portion: 85, kcal_per_100: 447 }] };
    const item = susunAnalisa([indomie], balasan, 'TEXT').items[0]!;

    expect(item.nutrition_source).toBe('LABEL');
    expect(item.calories).toBe(700);
    expect(item.protein_g).toBe(16);
    expect(item.carbs_g).toBe(108);
    expect(item.fat_g).toBe(24);
    expect(item.sugar_g).toBe(14);
    expect(item.sugar_source).toBe('LABEL');
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

  it('model tidak perlu dipanggil kalau semua item dari kemasan lengkap dengan gula', () => {
    expect(perluModel([indomie])).toBe(false);
    expect(perluModel([indomie, { name: 'Telur', portions: 1, unit: 'g' }])).toBe(true);
  });

  it('kemasan tanpa gula membuat model ditanya, tapi cuma untuk gulanya', () => {
    const tanpaGula = { ...indomie, label: { kcal: 350, carbs_g: 54 } };
    expect(perluModel([tanpaGula])).toBe(true);
    expect(kebutuhanModel(tanpaGula, null)).toEqual({ gizi: false, gula: true, berat: false });
  });
});

describe('gula', () => {
  it('per 100 dari model dikalikan jumlah yang dimakan', () => {
    const teh = { name: 'Teh pucuk', portions: 3, unit: 'ml' as const, weight: 350 };
    const balasan = {
      items: [{ index: 1, kcal_per_100: 28, carbs_per_100: 7, sugar_per_100: 5.1 }],
    };
    const item = susunAnalisa([teh], balasan, 'TEXT').items[0]!;

    // 3 × 350 ml × 5,1 / 100
    expect(item.sugar_g).toBeCloseTo(53.6, 1);
    expect(item.sugar_source).toBe('AI');
  });

  it('gula dari model tidak pernah lebih besar dari karbonya', () => {
    const balasan = {
      items: [{ index: 1, kcal_per_100: 300, carbs_per_100: 20, sugar_per_100: 45 }],
    };
    const item = susunAnalisa([{ ...ayam, weight: 100 }], balasan, 'TEXT').items[0]!;
    expect(item.sugar_per_100).toBe(20);
  });

  it('model diam soal gula: tidak diketahui, bukan nol yang meyakinkan', () => {
    const balasan = { items: [{ index: 1, kcal_per_100: 130, carbs_per_100: 28 }] };
    const item = susunAnalisa([{ ...ayam, weight: 100 }], balasan, 'TEXT').items[0]!;
    expect(item.sugar_g).toBe(0);
    expect(item.sugar_source).toBeNull();
  });

  it('kemasan tanpa gula: diturunkan dari rasio gula per karbo taksiran model', () => {
    const biskuat = {
      name: 'Biskuat',
      portions: 1,
      unit: 'g' as const,
      label: { kcal: 95, carbs_g: 17 },
    };
    const balasan = {
      items: [{ index: 1, kcal_per_100: 470, carbs_per_100: 70, sugar_per_100: 21 }],
    };
    const item = susunAnalisa([biskuat], balasan, 'TEXT').items[0]!;

    // 17 g karbo × 21/70
    expect(item.sugar_g).toBeCloseTo(5.1, 1);
    expect(item.sugar_source).toBe('AI');
  });

  it('rasio jatuh ke gula per kalori kalau karbo kemasan tidak diisi', () => {
    expect(gulaDariRasio({ kcal: 100 }, per100(400, { carbs: 0, sugar: 20 }))).toBe(5);
    expect(gulaDariRasio({ kcal: 100 }, per100(400, { sugar: null }))).toBeNull();
    // Tidak pernah lebih dari karbo di kemasan.
    expect(gulaDariRasio({ kcal: 100, carbs_g: 2 }, per100(400, { carbs: 10, sugar: 10 }))).toBe(2);
  });
});

describe('catatan yang dipilih lewat saran', () => {
  const nescafe = { name: 'Nescafe Classic bubuk', portions: 1, unit: 'g' as const };

  const ingatanAI: IngatanItem = {
    weight_per_portion: 8,
    label: null,
    per100: per100(350, { protein: 12, carbs: 41, fat: 0.5, sugar: 0 }),
    sugar_per_portion: null,
  };

  it('memakai nilai per 100 dari catatan, bukan dari model, dan menandai PREVIOUS', () => {
    const k = putuskan(
      { ...nescafe, weight: 12 },
      { model: { berat: 8, per100: per100(100) }, tersimpan: ingatanAI },
    );
    const hasil = hitungItem({ ...nescafe, weight: 12 }, k);

    expect(hasil.kcal_per_100).toBe(350);
    expect(hasil.calories).toBe(42);
    expect(hasil.nutrition_source).toBe('PREVIOUS');
    expect(hasil.sugar_source).toBe('PREVIOUS');
  });

  it('berat yang sama persis dengan catatan ditandai PREVIOUS, bukan USER', () => {
    const k = putuskan({ ...nescafe, weight: 8 }, { model: null, tersimpan: ingatanAI });
    expect(k.sumberBerat).toBe('PREVIOUS');
  });

  it('berat yang diubah user ditandai USER, gizinya tetap dari catatan', () => {
    const k = putuskan({ ...nescafe, weight: 12 }, { model: null, tersimpan: ingatanAI });
    expect(k.sumberBerat).toBe('USER');
    expect(k.sumberGizi).toBe('PREVIOUS');
  });

  it('berat dikosongkan tanpa foto: dari catatan, ditandai PREVIOUS (dulu tertulis AI)', () => {
    const hasil = hitungItem(nescafe, putuskan(nescafe, { model: null, tersimpan: ingatanAI }));
    expect(hasil.weight_per_portion).toBe(8);
    expect(hasil.weight_source).toBe('PREVIOUS');
    expect(hasil.calories).toBe(28);
  });

  /** Celah 3: klik saran, kosongkan berat, lampirkan foto = porsi dilihat dari foto. */
  it('berat dikosongkan dengan foto: berat dari foto, gizi tetap dari catatan', () => {
    const analisa = susunAnalisa(
      [nescafe],
      { items: [{ index: 1, grams_per_portion: 15, kcal_per_100: 100 }] },
      'PHOTO',
      { ingatan: [ingatanAI] },
    );
    const item = analisa.items[0]!;

    expect(item.weight_per_portion).toBe(15);
    expect(item.weight_source).toBe('AI');
    expect(item.kcal_per_100).toBe(350);
    expect(item.nutrition_source).toBe('PREVIOUS');
  });

  it('kemasan yang pernah dipakai dihitung seperti label tapi ditandai PREVIOUS', () => {
    const ingatanLabel: IngatanItem = {
      weight_per_portion: null,
      label: { kcal: 28, protein_g: 1, sugar_g: 0 },
      per100: per100(350),
      sugar_per_portion: null,
    };
    const item = { ...nescafe, portions: 2 };
    const hasil = hitungItem(item, putuskan(item, { model: null, tersimpan: ingatanLabel }));

    expect(hasil.calories).toBe(56);
    expect(hasil.protein_g).toBe(2);
    expect(hasil.nutrition_source).toBe('PREVIOUS');
    expect(hasil.label).toEqual({ kcal: 28, protein_g: 1, carbs_g: 0, fat_g: 0, sugar_g: 0 });
  });

  it('label yang diketik user hari ini menang atas catatan', () => {
    const item = { ...nescafe, label: { kcal: 30 } };
    const hasil = hitungItem(item, putuskan(item, { model: null, tersimpan: ingatanAI }));

    expect(hasil.calories).toBe(30);
    expect(hasil.nutrition_source).toBe('LABEL');
  });

  it('catatan dari sebelum fitur gula: gizi dari catatan, gula ditanya ke model', () => {
    const tanpaGula = { ...ingatanAI, per100: { ...ingatanAI.per100, sugar: null } };
    expect(kebutuhanModel(nescafe, tanpaGula)).toEqual({ gizi: false, gula: true, berat: false });

    const analisa = susunAnalisa(
      [nescafe],
      { items: [{ index: 1, kcal_per_100: 1, carbs_per_100: 41, sugar_per_100: 2 }] },
      'TEXT',
      { ingatan: [tanpaGula] },
    );
    const item = analisa.items[0]!;
    expect(item.kcal_per_100).toBe(350);
    expect(item.sugar_per_100).toBe(2);
    expect(item.sugar_source).toBe('AI');
  });

  it('model tidak dipanggil kalau semua item tertutup catatan lengkap', () => {
    expect(perluModel([nescafe], [ingatanAI], false)).toBe(false);
  });

  it('dengan foto dan berat kosong, model dipanggil untuk menaksir porsinya', () => {
    expect(perluModel([nescafe], [ingatanAI], true)).toBe(true);
    expect(perluModel([{ ...nescafe, weight: 8 }], [ingatanAI], true)).toBe(false);
  });

  it('kebutuhan model per item: gizi, gula, dan berat dinilai terpisah', () => {
    expect(kebutuhanModel(nescafe, null)).toEqual({ gizi: true, gula: false, berat: true });
    expect(kebutuhanModel(nescafe, ingatanAI)).toEqual({ gizi: false, gula: false, berat: false });
    expect(kebutuhanModel({ ...nescafe, weight: 8 }, null)).toEqual({
      gizi: true,
      gula: false,
      berat: false,
    });
    expect(kebutuhanModel({ ...nescafe, label: { kcal: 28, sugar_g: 0 } }, null)).toEqual({
      gizi: false,
      gula: false,
      berat: false,
    });
  });

  it('susunAnalisa meneruskan catatan per item, item lain tetap dari model', () => {
    const analisa = susunAnalisa(
      [nescafe, { name: 'Roti', portions: 1, unit: 'g' }],
      {
        items: [
          { index: 1, grams_per_portion: 99, kcal_per_100: 1 },
          { index: 2, grams_per_portion: 30, kcal_per_100: 250 },
        ],
      },
      'TEXT',
      { ingatan: [ingatanAI, null] },
    );

    expect(analisa.items[0]?.nutrition_source).toBe('PREVIOUS');
    expect(analisa.items[0]?.calories).toBe(28);
    expect(analisa.items[1]?.nutrition_source).toBe('AI');
    expect(analisa.items[1]?.calories).toBe(75);
    expect(analisa.total_calories).toBe(103);
  });
});

describe('koreksi mempertahankan asal angka', () => {
  const nasi = { name: 'Nasi putih', portions: 2, unit: 'g' as const, weight: 150 };
  const tersimpan: IngatanItem = {
    weight_per_portion: 150,
    label: null,
    per100: per100(130, { carbs: 28, sugar: 0.1 }),
    sugar_per_portion: null,
  };

  it('porsi diubah: dihitung ulang dari nilai tersimpan, asal AI tetap AI', () => {
    const k = putuskan(nasi, {
      model: null,
      tersimpan,
      asalTersimpan: { gizi: 'AI', gula: 'BACKFILL', berat: 'AI' },
    });
    const hasil = hitungItem(nasi, k);

    expect(hasil.calories).toBe(390);
    expect(hasil.nutrition_source).toBe('AI');
    expect(hasil.weight_source).toBe('AI');
    expect(hasil.sugar_source).toBe('BACKFILL');
  });

  it('kemasan ditambahkan saat koreksi tanpa gula: gula diturunkan dari catatan, tanpa model', () => {
    const item = { ...nasi, portions: 1, label: { kcal: 200, carbs_g: 40 } };
    const k = putuskan(item, {
      model: null,
      tersimpan,
      asalTersimpan: { gizi: 'AI', gula: 'AI', berat: 'USER' },
    });
    const hasil = hitungItem(item, k);

    expect(hasil.nutrition_source).toBe('LABEL');
    // 40 g karbo × 0,1 / 28
    expect(hasil.sugar_g).toBeCloseTo(0.1, 1);
  });
});

describe('pemeriksaan kemasan', () => {
  it('menangkap Biskuat 30 Sep: 25 kkal padahal makronya sekitar 95', () => {
    expect(labelTidakCocok({ kcal: 25, protein_g: 1, carbs_g: 17, fat_g: 2.5 })).toBe(true);
  });

  it('membiarkan label wajar dengan pembulatan resmi', () => {
    expect(labelTidakCocok({ kcal: 350, protein_g: 8, carbs_g: 54, fat_g: 12 })).toBe(false);
  });

  it('makro sebagian cuma diperiksa kalau sudah melebihi kalorinya', () => {
    expect(labelTidakCocok({ kcal: 28, protein_g: 1 })).toBe(false);
    expect(labelTidakCocok({ kcal: 10, carbs_g: 20 })).toBe(true);
    expect(labelTidakCocok({ kcal: 120 })).toBe(false);
  });
});
