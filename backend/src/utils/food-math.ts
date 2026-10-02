import type { FoodUnit } from '../constants/enums.js';
import { logger } from './logger.js';

/**
 * Perhitungan gizi satu sesi makan, murni tanpa akses data.
 *
 * Dipisah dari food.service supaya bisa diuji tanpa Directus, sama seperti
 * calories.ts. Aturan tunggalnya: model menaksir, backend menghitung. Nama,
 * jumlah porsi, dan satuan datang dari user dan tidak pernah disentuh; berat
 * per porsi dari user kalau diisi, kalau tidak dari foto atau catatan; nilai
 * gizi per 100 dari model, kemasan, atau catatan yang dipilih user; dan SEMUA
 * perkalian dikerjakan di sini.
 *
 * Dua tahap, sengaja dipisah:
 *   1. putuskan()  memilih dari mana berat, gizi, dan gula tiap item datang
 *   2. hitungItem() mengalikan, tanpa tahu asal-usul angkanya
 */

/**
 * Nilai gizi SATU porsi yang dibaca user dari kemasan.
 *
 * Kalau ada, ini menang mutlak atas taksiran model: kemasan Indomie lebih
 * benar daripada tebakan apa pun. Makro dan gula opsional, kalorinya wajib.
 */
export interface FoodLabel {
  kcal: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sugar_g?: number;
}

export interface FoodItemInput {
  name: string;
  portions: number;
  unit: FoodUnit;
  weight?: number;
  label?: FoodLabel;
  /**
   * true kalau user memilih item ini dari saran "Dari catatanmu". HANYA ini
   * yang membuat ingatan makanan dipakai: nama yang diketik sama persis tetap
   * ditaksir dari nol, karena klik berarti "sama seperti kemarin" dan ketik
   * berarti "taksir dari awal". Lihat food-memory.ts.
   */
  from_memory?: boolean;
}

/**
 * Asal angka gula satu item.
 *
 * BACKFILL artinya diisi belakangan untuk catatan dari sebelum fitur gula
 * ada, satu taksiran per nama makanan. Kalori dan makronya tidak disentuh.
 */
export type SugarSource = 'LABEL' | 'AI' | 'PREVIOUS' | 'BACKFILL';

/**
 * Satu makanan di dalam sesi makan, sesudah dihitung backend.
 *
 * Tiga hal pertama ditulis user dan tidak pernah diubah siapa pun. Berat per
 * porsi dan gizinya ditandai asalnya. Angka total hasil perkalian di sini.
 */
export interface FoodItem {
  name: string;
  portions: number;
  unit: FoodUnit;
  /** Berat atau volume SATU porsi. */
  weight_per_portion: number;
  /**
   * USER diketik user, AI taksiran model dari foto, PREVIOUS dipakai ulang
   * dari catatan yang dipilih lewat saran.
   */
  weight_source: 'USER' | 'AI' | 'PREVIOUS';
  /**
   * Dari mana nilai gizinya: taksiran model, kemasan yang dibaca user, atau
   * PREVIOUS: dipakai ulang dari catatan user sebelumnya yang dia pilih lewat
   * saran, supaya item yang sama tidak dapat angka berbeda tiap hari.
   */
  nutrition_source: 'AI' | 'LABEL' | 'PREVIOUS';
  /** Angka kemasan per porsi yang dipakai, kalau ada (LABEL, atau PREVIOUS dari kemasan). */
  label: FoodLabel | null;
  /** Total yang dimakan: portions × weight_per_portion. */
  amount: number;
  kcal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  sugar_per_100: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  /** Null kalau gula item ini tidak diketahui; dihitung nol. */
  sugar_source: SugarSource | null;
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
  sugar_g: number;
  confidence: string | null;
  /**
   * Null kalau tidak ada foto, ATAU model tidak dipanggil sama sekali karena
   * semua item tertutup kemasan dan catatan: tidak ada yang melihat fotonya,
   * jadi menyebutnya "cocok" adalah klaim kosong. false kalau model melihat
   * foto yang jelas salah lampir.
   */
  photo_matches: boolean | null;
  photo_note: string | null;
  /** true setelah user menekan Abaikan pada tanda foto tidak cocok. */
  photo_dismissed?: boolean;
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

/** Batas kalori satu porsi dari kemasan. Di atas ini pasti salah baca satuan. */
const MAKS_KKAL_LABEL_PER_PORSI = 5000;

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
  /** Null kalau tidak diketahui: model diam, atau catatan dari sebelum fitur gula. */
  sugar: number | null;
  missing: boolean;
}

const KOSONG: Per100 = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: null, missing: true };

export const per100Dari = (r: Record<string, unknown> | undefined): Per100 => {
  const kcal = r ? angka(r.kcal_per_100) : null;

  // Kalori adalah yang pokok. Kalau itu tidak ada, seluruh gizinya dianggap
  // hilang walau makronya kebetulan terisi, supaya tandanya tidak setengah.
  if (kcal === null) return KOSONG;

  const karboMentah = angka(r?.carbs_per_100);
  const karbo = bulat(batas(karboMentah ?? 0, MAKS_MAKRO_PER_100), 1);
  const gulaMentah = angka(r?.sugar_per_100);

  return {
    kcal: Math.round(batas(kcal, MAKS_KKAL_PER_100)),
    protein: bulat(batas(angka(r?.protein_per_100) ?? 0, MAKS_MAKRO_PER_100), 1),
    carbs: karbo,
    fat: bulat(batas(angka(r?.fat_per_100) ?? 0, MAKS_MAKRO_PER_100), 1),
    // Gula bagian dari karbohidrat, jadi tidak pernah lebih besar darinya.
    // Kalau model lupa menyebut karbo, gulanya dipercaya apa adanya.
    sugar:
      gulaMentah === null
        ? null
        : bulat(Math.min(batas(gulaMentah, MAKS_MAKRO_PER_100), karboMentah ?? Infinity), 1),
    missing: false,
  };
};

/**
 * Gizi yang dipakai ulang tanpa memanggil model: dari ingatan makanan (item
 * yang dipilih lewat saran), atau dari item itu sendiri saat dikoreksi.
 * Didefinisikan di sini supaya perhitungan tidak bergantung ke modul yang
 * membaca Directus.
 */
export interface IngatanItem {
  weight_per_portion: number | null;
  label: FoodLabel | null;
  per100: Per100;
  /**
   * Gula SATU porsi untuk item dari kemasan yang labelnya tidak menyebut gula
   * (ditaksir model atau diisi belakangan). Null kalau tidak diketahui.
   */
  sugar_per_portion: number | null;
}

/** Hasil model untuk satu item: berat dari foto dan nilai per 100. */
export interface TaksiranModel {
  berat: number | null;
  per100: Per100;
}

/** Keputusan dari mana angka satu item datang. Dihasilkan putuskan(). */
export interface Keputusan {
  berat: number;
  sumberBerat: FoodItem['weight_source'];
  sumberGizi: FoodItem['nutrition_source'];
  /** Ada: gizi dari kemasan per porsi. Null: gizi dari nilai per 100. */
  label: FoodLabel | null;
  /** Dipakai kalau label null. Gulanya ikut dipakai dengan asal sumberGula. */
  per100: Per100;
  /** Gula SATU porsi untuk item kemasan. Null kalau tidak diketahui. */
  gulaPerPorsi: number | null;
  sumberGula: SugarSource;
}

/**
 * Gula satu porsi item kemasan yang labelnya tidak menyebut gula, diturunkan
 * dari profil per 100 taksiran model. Lewat rasio, bukan berat, karena item
 * kemasan sering dicatat tanpa berat: gula/karbo dikali karbo kemasan, atau
 * kalau karbonya tidak diisi, gula/kkal dikali kalori kemasan. Tidak pernah
 * lebih besar dari karbo di kemasan.
 */
export const gulaDariRasio = (label: FoodLabel, model: Per100): number | null => {
  if (model.missing || model.sugar === null) return null;

  const karbo = karboKemasan(label);
  let gula: number;
  if (karbo !== undefined && model.carbs > 0) {
    gula = (karbo * model.sugar) / model.carbs;
  } else if (model.kcal > 0) {
    gula = (label.kcal * model.sugar) / model.kcal;
  } else {
    gula = 0;
  }

  return bulat(karbo === undefined ? gula : Math.min(gula, karbo), 1);
};

/**
 * Karbohidrat kemasan yang bisa dipercaya, atau undefined kalau tidak diketahui.
 *
 * Nol di sini ambigu: item kemasan yang tersimpan menulis makro yang tidak
 * diisi sebagai nol. Nol dipercaya hanya kalau protein dan lemak sudah
 * menjelaskan sebagian besar kalorinya; teh botol 120 kkal dengan karbo "0"
 * jelas karbonya tidak diisi, bukan tidak ada.
 */
const karboKemasan = (label: FoodLabel): number | undefined => {
  if (label.carbs_g === undefined) return undefined;
  if (label.carbs_g > 0) return label.carbs_g;
  const lainnya = 4 * (label.protein_g ?? 0) + 9 * (label.fat_g ?? 0);
  return lainnya >= 0.8 * label.kcal ? 0 : undefined;
};

/**
 * Konteks satu item saat diputuskan.
 *
 * `tersimpan` adalah gizi yang dipakai ulang: ingatan makanan saat mencatat
 * (hanya untuk item yang diklik dari saran), atau item itu sendiri saat
 * dikoreksi. `asalTersimpan` menentukan tandanya: PREVIOUS untuk ingatan,
 * asal semula untuk koreksi, supaya koreksi porsi tidak mengubah AI jadi
 * PREVIOUS atau sebaliknya.
 */
export interface KonteksItem {
  model: TaksiranModel | null;
  tersimpan?: IngatanItem | null;
  asalTersimpan?: {
    gizi: FoodItem['nutrition_source'];
    gula: SugarSource | null;
    berat: FoodItem['weight_source'];
  };
  /** Model diminta menaksir berat item ini dari foto. */
  beratDariFoto?: boolean;
}

/**
 * Memutuskan dari mana berat, gizi, dan gula satu item datang.
 *
 * Berat: diketik user; kalau kosong dan ada foto, taksiran foto (klik saran
 * lalu kosongkan berat = "lihat porsinya dari foto"); kalau tidak, dari yang
 * tersimpan; terakhir taksiran model. Berat yang sama persis dengan catatan
 * tersimpan ditandai sesuai asalnya, bukan USER: layar mengisinya otomatis
 * saat saran diklik, user tidak mengetiknya.
 *
 * Gizi: kemasan yang diketik user > yang tersimpan > model.
 * Gula: kemasan > yang tersimpan > model > tidak diketahui.
 */
export const putuskan = (item: FoodItemInput, k: KonteksItem): Keputusan => {
  const simpan = k.tersimpan ?? null;
  const asal: NonNullable<KonteksItem['asalTersimpan']> = k.asalTersimpan ?? {
    gizi: 'PREVIOUS',
    gula: 'PREVIOUS',
    berat: 'PREVIOUS',
  };
  const model = k.model ?? { berat: null, per100: KOSONG };

  // ---------- berat ----------
  let berat: number;
  let sumberBerat: FoodItem['weight_source'];
  const beratSimpan = simpan?.weight_per_portion ?? null;

  if (item.weight !== undefined) {
    berat = item.weight;
    sumberBerat = beratSimpan !== null && item.weight === beratSimpan ? asal.berat : 'USER';
  } else if (k.beratDariFoto && model.berat !== null) {
    berat = model.berat;
    sumberBerat = 'AI';
  } else if (beratSimpan !== null) {
    berat = beratSimpan;
    sumberBerat = asal.berat;
  } else {
    berat = model.berat ?? 0;
    sumberBerat = 'AI';
  }

  // ---------- gizi dan gula ----------
  // Kemasan yang diketik user hari ini selalu menang.
  if (item.label) {
    const gulaLabel = item.label.sugar_g;
    const gulaSimpan = simpan?.label ? (simpan.label.sugar_g ?? simpan.sugar_per_portion) : null;
    const gulaModel = gulaDariRasio(item.label, model.per100);
    // Kemasan baru diketik saat koreksi item yang tadinya ditaksir per 100:
    // gulanya diturunkan dari profil yang tersimpan, tanpa memanggil model.
    const gulaRasioSimpan =
      simpan && !simpan.label ? gulaDariRasio(item.label, simpan.per100) : null;

    let gulaPerPorsi: number | null = null;
    let sumberGula: SugarSource = 'AI';
    if (gulaLabel !== undefined) {
      [gulaPerPorsi, sumberGula] = [gulaLabel, 'LABEL'];
    } else if (gulaSimpan !== null) {
      [gulaPerPorsi, sumberGula] = [gulaSimpan, asal.gula ?? 'PREVIOUS'];
    } else if (gulaModel !== null) {
      [gulaPerPorsi, sumberGula] = [gulaModel, 'AI'];
    } else if (gulaRasioSimpan !== null) {
      [gulaPerPorsi, sumberGula] = [gulaRasioSimpan, asal.gula ?? 'PREVIOUS'];
    }

    return {
      berat,
      sumberBerat,
      sumberGizi: 'LABEL',
      label: item.label,
      per100: KOSONG,
      gulaPerPorsi,
      sumberGula,
    };
  }

  if (simpan) {
    // Kemasan yang pernah dipakai: dihitung persis seperti label (per porsi
    // dikali jumlah porsi), dengan tanda asalnya.
    if (simpan.label) {
      const gulaSimpan = simpan.label.sugar_g ?? simpan.sugar_per_portion;

      return {
        berat,
        sumberBerat,
        sumberGizi: asal.gizi,
        label: simpan.label,
        per100: KOSONG,
        gulaPerPorsi: gulaSimpan ?? gulaDariRasio(simpan.label, model.per100),
        sumberGula: gulaSimpan === null ? 'AI' : (asal.gula ?? 'PREVIOUS'),
      };
    }

    const gulaSimpan = simpan.per100.sugar;
    const gulaModel = model.per100.missing ? null : model.per100.sugar;

    return {
      berat,
      sumberBerat,
      sumberGizi: asal.gizi,
      label: null,
      per100: { ...simpan.per100, sugar: gulaSimpan ?? gulaModel },
      gulaPerPorsi: null,
      sumberGula: gulaSimpan === null ? 'AI' : (asal.gula ?? 'PREVIOUS'),
    };
  }

  return {
    berat,
    sumberBerat,
    sumberGizi: 'AI',
    label: null,
    per100: model.per100,
    gulaPerPorsi: null,
    sumberGula: 'AI',
  };
};

/**
 * Menghitung satu item dari keputusannya. Nama, jumlah, dan satuan dari user
 * apa adanya. Semua perkalian di sini.
 */
export const hitungItem = (item: FoodItemInput, k: Keputusan): FoodItem => {
  const beratPerPorsi = batas(k.berat, MAKS_BERAT_PER_PORSI);
  const jumlah = item.portions * beratPerPorsi;

  const dasar = {
    name: item.name,
    portions: item.portions,
    unit: item.unit,
    weight_per_portion: Math.round(beratPerPorsi),
    weight_source: k.sumberBerat,
    amount: Math.round(jumlah),
  };

  /*
    Kemasan menang mutlak. Angkanya PER PORSI dan dikalikan jumlah porsi di
    sini, sama seperti berat: user menulis satuannya, perkalian tidak pernah
    diserahkan ke user maupun model. Nilai per 100 diturunkan balik dari
    kemasan kalau beratnya diketahui, supaya rinciannya tetap konsisten.
  */
  if (k.label) {
    const kcal = batas(k.label.kcal, MAKS_KKAL_LABEL_PER_PORSI);
    const protein = k.label.protein_g ?? 0;
    const carbs = k.label.carbs_g ?? 0;
    const fat = k.label.fat_g ?? 0;
    const gula = k.gulaPerPorsi ?? 0;
    const per100 = beratPerPorsi > 0 ? 100 / beratPerPorsi : 0;

    return {
      ...dasar,
      kcal_per_100: Math.round(kcal * per100),
      protein_per_100: bulat(protein * per100, 1),
      carbs_per_100: bulat(carbs * per100, 1),
      fat_per_100: bulat(fat * per100, 1),
      sugar_per_100: bulat(gula * per100, 1),
      calories: Math.round(kcal * item.portions),
      protein_g: bulat(protein * item.portions, 1),
      carbs_g: bulat(carbs * item.portions, 1),
      fat_g: bulat(fat * item.portions, 1),
      sugar_g: bulat(gula * item.portions, 1),
      sugar_source: k.gulaPerPorsi === null ? null : k.sumberGula,
      nutrition_missing: false,
      nutrition_source: k.sumberGizi,
      label: {
        kcal,
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat,
        ...(k.label.sugar_g === undefined ? {} : { sugar_g: k.label.sugar_g }),
      },
    };
  }

  const nilai = k.per100;
  const rasio = jumlah / 100;

  return {
    ...dasar,
    kcal_per_100: nilai.kcal,
    protein_per_100: nilai.protein,
    carbs_per_100: nilai.carbs,
    fat_per_100: nilai.fat,
    sugar_per_100: nilai.sugar ?? 0,
    calories: Math.round(nilai.kcal * rasio),
    protein_g: bulat(nilai.protein * rasio, 1),
    carbs_g: bulat(nilai.carbs * rasio, 1),
    fat_g: bulat(nilai.fat * rasio, 1),
    sugar_g: bulat((nilai.sugar ?? 0) * rasio, 1),
    sugar_source: nilai.sugar === null ? null : k.sumberGula,
    nutrition_missing: nilai.missing,
    nutrition_source: k.sumberGizi,
    label: null,
  };
};

/**
 * Apa yang masih dibutuhkan dari model untuk satu item, setelah kemasan dan
 * catatan tersimpan diperhitungkan.
 *
 *   gizi   tidak ada kemasan dan tidak ada catatan yang dipilih
 *   gula   gizinya sudah ada, tapi gulanya belum diketahui
 *   berat  berat kosong dan bukan kemasan, lalu ada foto (berat dari foto,
 *          walau catatan menyimpan berat) atau tidak ada berat tersimpan
 */
export const kebutuhanModel = (
  item: FoodItemInput,
  tersimpan: IngatanItem | null,
  adaFoto = false,
): { gizi: boolean; gula: boolean; berat: boolean } => {
  const gizi = !item.label && tersimpan === null;

  let gula = false;
  if (item.label) {
    const dariSimpan = tersimpan?.label
      ? (tersimpan.label.sugar_g ?? tersimpan.sugar_per_portion) !== null
      : tersimpan !== null && !tersimpan.per100.missing && tersimpan.per100.sugar !== null;
    gula = item.label.sugar_g === undefined && !dariSimpan;
  } else if (tersimpan) {
    gula = tersimpan.label
      ? (tersimpan.label.sugar_g ?? tersimpan.sugar_per_portion) === null
      : tersimpan.per100.sugar === null;
  }

  const berat =
    item.weight === undefined &&
    !item.label &&
    !tersimpan?.label &&
    (adaFoto || (tersimpan?.weight_per_portion ?? null) === null);

  return { gizi, gula, berat };
};

/**
 * Apakah model masih perlu dipanggil. Tidak, kalau semua item sudah tertutup
 * kemasan atau catatan: memanggil model cuma membuang waktu tunggu dan kuota,
 * dan justru membuka pintu untuk angka yang berbeda dari kemarin. Berat yang
 * kosong hanya bisa ditaksir dari foto, jadi tanpa foto itu bukan alasan
 * memanggil model (validasinya menolak lebih dulu).
 */
export const perluModel = (
  items: FoodItemInput[],
  tersimpan: (IngatanItem | null)[] = [],
  adaFoto = false,
): boolean =>
  items.some((item, i) => {
    const butuh = kebutuhanModel(item, tersimpan[i] ?? null, adaFoto);
    return butuh.gizi || butuh.gula || (adaFoto && butuh.berat);
  });

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
  // Item lama dari sebelum fitur gula belum punya kolomnya.
  sugar_g: bulat(
    total(items, (i) => (typeof i.sugar_g === 'number' ? i.sugar_g : 0)),
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
export const balasanPerItem = (raw: Record<string, unknown>, jumlah: number): TaksiranModel[] => {
  const daftar = Array.isArray(raw.items) ? raw.items : [];
  const hasil: (Record<string, unknown> | undefined)[] = Array.from({ length: jumlah });

  daftar.forEach((entri: unknown, posisi) => {
    if (typeof entri !== 'object' || entri === null || Array.isArray(entri)) return;
    const r = entri as Record<string, unknown>;
    const index = angka(r.index);
    const tujuan = index !== null && index >= 1 && index <= jumlah ? index - 1 : posisi;
    if (tujuan < jumlah && hasil[tujuan] === undefined) hasil[tujuan] = r;
  });

  return hasil.map((r) => ({ berat: angka(r?.grams_per_portion), per100: per100Dari(r) }));
};

export interface OpsiAnalisa {
  /** Catatan yang dipakai ulang per item, null untuk item yang tidak diklik dari saran. */
  ingatan?: (IngatanItem | null)[];
  /** Model benar-benar dipanggil. Tanpa itu, foto tidak pernah dilihat siapa pun. */
  modelDipanggil?: boolean;
}

export const susunAnalisa = (
  items: FoodItemInput[],
  raw: Record<string, unknown>,
  source: FoodAnalysis['source'],
  opsi: OpsiAnalisa = {},
): FoodAnalysis => {
  const balasan = balasanPerItem(raw, items.length);
  const adaFoto = source === 'PHOTO';
  const modelDipanggil = opsi.modelDipanggil ?? Object.keys(raw).length > 0;

  const dihitung = items.map((item, i) => {
    const tersimpan = opsi.ingatan?.[i] ?? null;
    return hitungItem(
      item,
      putuskan(item, {
        model: balasan[i] ?? null,
        tersimpan,
        beratDariFoto: adaFoto && kebutuhanModel(item, tersimpan, true).berat,
      }),
    );
  });

  // Item dari kemasan tidak pernah "hilang", modelnya memang tidak ditanya.
  const hilang = dihitung.filter((i) => i.nutrition_missing).map((i) => i.name);
  if (hilang.length > 0) {
    logger.warn({ hilang }, 'Model tidak memberi nilai gizi untuk sebagian item');
  }

  const cocok = adaFoto && typeof raw.photo_matches === 'boolean' ? raw.photo_matches : null;

  return {
    source,
    items: dihitung,
    ...jumlahkan(dihitung),
    confidence: typeof raw.confidence === 'string' ? raw.confidence : null,
    photo_matches: adaFoto && modelDipanggil ? (cocok ?? true) : null,
    photo_note:
      modelDipanggil &&
      cocok === false &&
      typeof raw.photo_note === 'string' &&
      raw.photo_note.trim() !== ''
        ? raw.photo_note.trim()
        : null,
    user_edited: false,
    raw,
  };
};

// ============================================================
// PEMERIKSAAN KEMASAN
// ============================================================

/**
 * Kalori kemasan yang tidak cocok dengan makronya sendiri.
 *
 * Faktor Atwater: protein dan karbohidrat 4 kkal per gram, lemak 9. Label
 * resmi membulatkan dan serat dihitung lebih rendah, jadi selisih kecil wajar;
 * yang ditangkap di sini salah baca seperti Biskuat 30 Sep 2026: tertulis 25
 * kkal padahal makronya setara sekitar 95 kkal.
 *
 * Kalau ketiga makro diisi, selisih ke dua arah diperiksa. Kalau baru
 * sebagian, cuma diperiksa apakah makronya saja sudah melebihi kalorinya.
 * Ini peringatan untuk layar, BUKAN penolakan: user boleh menyimpan tetap.
 */
export const labelTidakCocok = (label: FoodLabel): boolean => {
  const { protein_g: p, carbs_g: c, fat_g: f } = label;
  if (p === undefined && c === undefined && f === undefined) return false;

  const dariMakro = 4 * (p ?? 0) + 4 * (c ?? 0) + 9 * (f ?? 0);
  const toleransi = Math.max(15, 0.2 * Math.max(label.kcal, dariMakro));
  const lengkap = p !== undefined && c !== undefined && f !== undefined;

  return lengkap
    ? Math.abs(label.kcal - dariMakro) > toleransi
    : dariMakro - label.kcal > toleransi;
};
