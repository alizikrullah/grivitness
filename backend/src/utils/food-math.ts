import type { FoodUnit } from '../constants/enums.js';
import { logger } from './logger.js';

/**
 * Perhitungan gizi satu sesi makan, murni tanpa akses data.
 *
 * Dipisah dari food.service supaya bisa diuji tanpa Directus, sama seperti
 * calories.ts. Aturan tunggalnya: model menaksir, backend menghitung. Nama,
 * jumlah porsi, dan satuan datang dari user dan tidak pernah disentuh; berat
 * per porsi dari user kalau diisi, kalau tidak dari model; nilai gizi per 100
 * dari model; dan SEMUA perkalian dikerjakan di sini.
 */

/** Satu makanan seperti yang ditulis user. Sama dengan FoodItemDto. */
/**
 * Nilai gizi SATU porsi yang dibaca user dari kemasan.
 *
 * Kalau ada, ini menang mutlak atas taksiran model: kemasan Indomie lebih
 * benar daripada tebakan apa pun. Makro opsional, kalorinya wajib.
 */
export interface FoodLabel {
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export interface FoodItemInput {
  name: string;
  portions: number;
  unit: FoodUnit;
  weight?: number;
  label?: FoodLabel;
}

/**
 * Satu makanan di dalam sesi makan, sesudah dihitung backend.
 *
 * Tiga hal pertama ditulis user dan tidak pernah diubah siapa pun. Berat per
 * porsi dari user atau taksiran model, ditandai asalnya. Nilai per 100 dari
 * model. Empat angka terakhir hasil perkalian, dan itu dikerjakan di sini.
 */
export interface FoodItem {
  name: string;
  portions: number;
  unit: FoodUnit;
  /** Berat atau volume SATU porsi. */
  weight_per_portion: number;
  weight_source: 'USER' | 'AI';
  /** Dari mana nilai gizinya: taksiran model, atau kemasan yang dibaca user. */
  nutrition_source: 'AI' | 'LABEL';
  /** Angka kemasan per porsi yang dipakai, kalau nutrition_source LABEL. */
  label: FoodLabel | null;
  /** Total yang dimakan: portions × weight_per_portion. */
  amount: number;
  kcal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /**
   * true kalau model tidak memberi nilai gizi untuk item ini, sehingga
   * angkanya nol. Ditandai, bukan disembunyikan, supaya user tahu item mana
   * yang perlu dicatat ulang, bukan mengira makanannya nol kalori.
   */
  nutrition_missing: boolean;
}

/** Isi kolom ai_analysis. Disimpan lengkap supaya layar tidak menghitung apa pun. */
export interface FoodAnalysis {
  /** Dari mana taksirannya: foto (model vision) atau teks saja (model chat). */
  source: 'PHOTO' | 'TEXT';
  items: FoodItem[];
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string | null;
  /** Null kalau tidak ada foto. false kalau model melihat makanan yang jelas berbeda. */
  photo_matches: boolean | null;
  photo_note: string | null;
  /** Ditandai setelah user mengoreksi item, supaya jelas bukan lagi murni taksiran. */
  user_edited: boolean;
  /** Balasan model utuh, untuk ditelusuri kalau ada yang aneh. */
  raw: Record<string, unknown>;
}

/**
 * Mengambil angka dari respons model.
 *
 * Model bisa membalas field yang hilang atau bertipe aneh walaupun sudah
 * diminta format tertentu. Yang tidak terbaca jadi null, dan pemanggil yang
 * memutuskan artinya: untuk gizi berarti "hilang" dan ditandai, bukan diam-diam
 * nol.
 */
const angka = (nilai: unknown): number | null => {
  const parsed = typeof nilai === 'string' ? Number(nilai) : nilai;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

/**
 * Batas atas yang berasal dari sifat makanannya sendiri, bukan dari selera.
 *
 * Lemak murni adalah bahan pangan terpadat yang ada, 900 kkal per 100 gram, jadi
 * apa pun di atas itu pasti keliru. Begitu juga satu makro tidak mungkin lebih
 * dari 100 gram di dalam 100 gram bahan. Batas beratnya lebih longgar karena
 * cuma untuk menangkal salah ketik nol, bukan untuk menilai porsi.
 */
const MAKS_BERAT_PER_PORSI = 5000;
const MAKS_KKAL_PER_100 = 900;
const MAKS_MAKRO_PER_100 = 100;

const batas = (nilai: number, maks: number): number => (nilai > maks ? maks : nilai);

const bulat = (nilai: number, desimal: number): number => {
  const faktor = 10 ** desimal;
  return Math.round(nilai * faktor) / faktor;
};

/** Nilai gizi per 100 g/ml satu item, sudah dibatasi. */
export interface Per100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  missing: boolean;
}

const per100Dari = (r: Record<string, unknown> | undefined): Per100 => {
  const kcal = r ? angka(r.kcal_per_100) : null;

  // Kalori adalah yang pokok. Kalau itu tidak ada, seluruh gizinya dianggap
  // hilang walau makronya kebetulan terisi, supaya tandanya tidak setengah.
  if (kcal === null) return { kcal: 0, protein: 0, carbs: 0, fat: 0, missing: true };

  return {
    kcal: Math.round(batas(kcal, MAKS_KKAL_PER_100)),
    protein: bulat(batas(angka(r?.protein_per_100) ?? 0, MAKS_MAKRO_PER_100), 1),
    carbs: bulat(batas(angka(r?.carbs_per_100) ?? 0, MAKS_MAKRO_PER_100), 1),
    fat: bulat(batas(angka(r?.fat_per_100) ?? 0, MAKS_MAKRO_PER_100), 1),
    missing: false,
  };
};

/**
 * Menghitung satu item. Nama, jumlah, dan satuan dari user apa adanya. Berat
 * dari user kalau ada, kalau tidak dari model. Perkalian di sini.
 */
/** Batas kalori satu porsi dari kemasan. Di atas ini pasti salah baca satuan. */
const MAKS_KKAL_LABEL_PER_PORSI = 5000;

export const hitungItem = (
  item: FoodItemInput,
  beratModel: number | null,
  gizi: Per100,
): FoodItem => {
  const dariUser = item.weight !== undefined;
  const beratPerPorsi = batas(item.weight ?? beratModel ?? 0, MAKS_BERAT_PER_PORSI);
  const jumlah = item.portions * beratPerPorsi;

  const dasar = {
    name: item.name,
    portions: item.portions,
    unit: item.unit,
    weight_per_portion: Math.round(beratPerPorsi),
    weight_source: dariUser ? ('USER' as const) : ('AI' as const),
    amount: Math.round(jumlah),
  };

  /*
    Kemasan menang mutlak. Angkanya PER PORSI dan dikalikan jumlah porsi di
    sini, sama seperti berat: user menulis satuannya, perkalian tidak pernah
    diserahkan ke user maupun model. Nilai per 100 diturunkan balik dari
    kemasan kalau beratnya diketahui, supaya rinciannya tetap konsisten.
  */
  if (item.label) {
    const kcal = batas(item.label.kcal, MAKS_KKAL_LABEL_PER_PORSI);
    const protein = item.label.protein_g ?? 0;
    const carbs = item.label.carbs_g ?? 0;
    const fat = item.label.fat_g ?? 0;
    const per100 = beratPerPorsi > 0 ? 100 / beratPerPorsi : 0;

    return {
      ...dasar,
      kcal_per_100: Math.round(kcal * per100),
      protein_per_100: bulat(protein * per100, 1),
      carbs_per_100: bulat(carbs * per100, 1),
      fat_per_100: bulat(fat * per100, 1),
      calories: Math.round(kcal * item.portions),
      protein_g: bulat(protein * item.portions, 1),
      carbs_g: bulat(carbs * item.portions, 1),
      fat_g: bulat(fat * item.portions, 1),
      nutrition_missing: false,
      nutrition_source: 'LABEL',
      label: { kcal, protein_g: protein, carbs_g: carbs, fat_g: fat },
    };
  }

  const rasio = jumlah / 100;

  return {
    ...dasar,
    kcal_per_100: gizi.kcal,
    protein_per_100: gizi.protein,
    carbs_per_100: gizi.carbs,
    fat_per_100: gizi.fat,
    calories: Math.round(gizi.kcal * rasio),
    protein_g: bulat(gizi.protein * rasio, 1),
    carbs_g: bulat(gizi.carbs * rasio, 1),
    fat_g: bulat(gizi.fat * rasio, 1),
    nutrition_missing: gizi.missing,
    nutrition_source: 'AI',
    label: null,
  };
};

/**
 * Apakah model masih perlu dipanggil. Tidak, kalau semua item punya angka
 * kemasan: kalorinya tidak bergantung berat maupun taksiran, jadi memanggil
 * model cuma membuang waktu tunggu dan kuota.
 */
export const perluModel = (items: FoodItemInput[]): boolean => items.some((i) => !i.label);

const total = (items: FoodItem[], ambil: (item: FoodItem) => number): number =>
  items.reduce((jumlah, item) => jumlah + ambil(item), 0);

export const jumlahkan = (items: FoodItem[]) => ({
  total_calories: Math.round(total(items, (i) => i.calories)),
  protein_g: bulat(
    total(items, (i) => i.protein_g),
    1,
  ),
  carbs_g: bulat(
    total(items, (i) => i.carbs_g),
    1,
  ),
  fat_g: bulat(
    total(items, (i) => i.fat_g),
    1,
  ),
});

/**
 * Mencocokkan balasan model ke item user.
 *
 * Model diminta membalas per nomor. Dicocokkan lewat `index` dulu, dan kalau
 * modelnya lupa menyertakan index, lewat urutan. Nama TIDAK dipakai untuk
 * mencocokkan, karena model bisa mengeja ulang nama dengan cara lain dan
 * pencocokan nama yang gagal justru membuat item kehilangan gizinya.
 */
const balasanPerItem = (raw: Record<string, unknown>, jumlah: number) => {
  const daftar = Array.isArray(raw.items) ? raw.items : [];
  const hasil: (Record<string, unknown> | undefined)[] = Array.from({ length: jumlah });

  daftar.forEach((entri: unknown, posisi) => {
    if (typeof entri !== 'object' || entri === null || Array.isArray(entri)) return;
    const r = entri as Record<string, unknown>;
    const index = angka(r.index);
    const tujuan = index !== null && index >= 1 && index <= jumlah ? index - 1 : posisi;
    if (tujuan < jumlah && hasil[tujuan] === undefined) hasil[tujuan] = r;
  });

  return hasil;
};

export const susunAnalisa = (
  items: FoodItemInput[],
  raw: Record<string, unknown>,
  source: FoodAnalysis['source'],
): FoodAnalysis => {
  const balasan = balasanPerItem(raw, items.length);

  const dihitung = items.map((item, i) =>
    hitungItem(item, angka(balasan[i]?.grams_per_portion), per100Dari(balasan[i])),
  );

  // Item dari kemasan tidak pernah "hilang", modelnya memang tidak ditanya.
  const hilang = dihitung.filter((i) => i.nutrition_missing).map((i) => i.name);
  if (hilang.length > 0) {
    logger.warn({ hilang }, 'Model tidak memberi nilai gizi untuk sebagian item');
  }

  const cocok =
    source === 'PHOTO' && typeof raw.photo_matches === 'boolean' ? raw.photo_matches : null;

  return {
    source,
    items: dihitung,
    ...jumlahkan(dihitung),
    confidence: typeof raw.confidence === 'string' ? raw.confidence : null,
    photo_matches: source === 'PHOTO' ? (cocok ?? true) : null,
    photo_note:
      cocok === false && typeof raw.photo_note === 'string' && raw.photo_note.trim() !== ''
        ? raw.photo_note.trim()
        : null,
    user_edited: false,
    raw,
  };
};
