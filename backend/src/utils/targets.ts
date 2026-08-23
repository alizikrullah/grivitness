import type { Gender } from '../constants/enums.js';
import { round } from './number.js';

/**
 * Target harian yang DITURUNKAN dari tubuh dan tujuan user, bukan angka tetap.
 *
 * Sebelumnya minum 2500ml, tidur 8 jam, dan langkah 10.000 ditulis langsung di
 * layar mobile — sama untuk semua orang, dan tidak satu pun punya sumber. Yang
 * 10.000 langkah bahkan asalnya nama produk pedometer Jepang tahun 1965
 * (manpo-kei, harfiahnya "meteran 10.000 langkah"), bukan penelitian.
 *
 * SUMBER
 *   Air        ESPEN/DGEM — 30-40 ml per kg berat badan per hari untuk dewasa.
 *              ACSM — tambahan cairan selama dan sesudah berolahraga.
 *   Tidur      Hirshkowitz M dkk. "National Sleep Foundation's sleep time duration
 *              recommendations: methodology and results summary." Sleep Health
 *              2015;1(1):40-43.
 *   Langkah    Paluch AE dkk. "Daily steps and all-cause mortality: a meta-analysis
 *              of 15 international cohorts." Lancet Public Health 2022;7(3):e219-e228.
 *   Protein    Morton RW dkk. "A systematic review, meta-analysis and meta-regression
 *              of the effect of protein supplementation on resistance training-induced
 *              gains in muscle mass and strength." Br J Sports Med 2018;52(6):376-384.
 *              Helms ER dkk. "A systematic review of dietary protein during caloric
 *              restriction." Int J Sport Nutr Exerc Metab 2014;24(2):127-138.
 *   Makro      IOM Dietary Reference Intakes — AMDR: lemak 20-35%, karbohidrat
 *              45-65%, protein 10-35% dari total energi.
 */

// ============================================================
// AIR
// ============================================================

/** ml air per kg berat badan per hari, menurun seiring usia. */
const ML_PER_KG_MUDA = 35;
const ML_PER_KG_LANSIA = 30;
const USIA_LANSIA = 55;

/** Tambahan cairan per jam olahraga, mengganti yang hilang lewat keringat. */
const ML_PER_JAM_OLAHRAGA = 500;

/** Batas atas. Minum berlebihan bukan tidak berbahaya — hiponatremia itu nyata. */
const AIR_MAKSIMAL_ML = 4000;
const AIR_MINIMAL_ML = 1500;

/**
 * Target minum harian.
 *
 * Yang bertubuh besar memang butuh lebih banyak, dan itu yang hilang dari angka
 * tetap 2500ml: orang 50kg dipaksa minum berlebihan sementara orang 100kg
 * merasa sudah cukup padahal belum.
 */
export const waterTargetMl = (weightKg: number, age: number, workoutMinutes = 0): number => {
  const perKg = age >= USIA_LANSIA ? ML_PER_KG_LANSIA : ML_PER_KG_MUDA;

  const dasar = weightKg * perKg;
  const tambahan = (workoutMinutes / 60) * ML_PER_JAM_OLAHRAGA;

  const total = Math.round((dasar + tambahan) / 50) * 50;

  return Math.min(Math.max(total, AIR_MINIMAL_ML), AIR_MAKSIMAL_ML);
};

// ============================================================
// TIDUR
// ============================================================

export interface SleepTarget {
  min_minutes: number;
  max_minutes: number;
}

/**
 * Target tidur sebagai RENTANG, bukan satu angka.
 *
 * National Sleep Foundation memang merekomendasikan 7-9 jam untuk dewasa, dan
 * 7-8 jam untuk 65 tahun ke atas. Buktinya berbentuk pita, jadi menampilkannya
 * sebagai "8 jam tepat" memalsukan ketelitian yang tidak dimiliki penelitiannya.
 * Memaksa personalisasi di sini juga akan mengarang — usia nyaris tidak
 * menggeser rentangnya untuk dewasa.
 */
export const sleepTarget = (age: number): SleepTarget => ({
  min_minutes: 7 * 60,
  max_minutes: (age >= 65 ? 8 : 9) * 60,
});

// ============================================================
// LANGKAH
// ============================================================

/** Manfaat mortalitas mendatar di sekitar angka ini, menurut meta-analisis Paluch. */
const LANGKAH_DASAR_MUDA = 8000;
const LANGKAH_DASAR_LANSIA = 6000;
const USIA_LANGKAH_LANSIA = 60;

/** Batas atas anjuran. Di atas ini target berhenti masuk akal sebagai kebiasaan harian. */
const LANGKAH_MAKSIMAL = 20_000;

export interface StepTarget {
  /** Total yang dianjurkan hari ini. */
  steps: number;
  /** Bagian yang murni untuk kesehatan, terlepas dari target berat badan. */
  baseline: number;
  /** Bagian tambahan yang khusus menutup defisit target berat badan. */
  for_goal: number;
}

/**
 * Target langkah harian.
 *
 * Dua lapis, dan pemisahan itu disengaja. Lapis pertama murni kesehatan dan
 * berlaku walau user tidak punya target berat badan. Lapis kedua muncul hanya
 * ketika target beratnya tidak bisa dicapai dari makanan saja tanpa menembus
 * batas aman — defisit yang tidak boleh datang dari piring masih boleh datang
 * dari kaki.
 *
 * Hasilnya angka yang bisa dijelaskan: "8.000 untuk kesehatan, 3.200 sisanya
 * untuk targetmu" — bukan satu angka bulat yang tidak bisa dipertanggungjawabkan.
 */
export const stepTarget = (age: number, extraForGoal = 0): StepTarget => {
  const dasar = age >= USIA_LANGKAH_LANSIA ? LANGKAH_DASAR_LANSIA : LANGKAH_DASAR_MUDA;
  const tambahan = Math.max(extraForGoal, 0);

  return {
    steps: Math.min(dasar + tambahan, LANGKAH_MAKSIMAL),
    baseline: dasar,
    for_goal: Math.min(tambahan, LANGKAH_MAKSIMAL - dasar),
  };
};

// ============================================================
// MAKRONUTRIEN
// ============================================================

const KKAL_PER_G_PROTEIN = 4;
const KKAL_PER_G_KARBO = 4;
const KKAL_PER_G_LEMAK = 9;

/** Gram protein per kg berat badan. Dinaikkan saat defisit untuk menahan kehilangan otot. */
const PROTEIN_PER_KG_NORMAL = 1.6;
const PROTEIN_PER_KG_DEFISIT = 1.8;

/** Batas atas protein yang masih wajar, supaya tidak menyisakan ruang terlalu sempit. */
const PROTEIN_MAKSIMAL_RASIO_ENERGI = 0.35;

/** Lemak minimal per kg. Di bawah ini produksi hormon dan penyerapan vitamin terganggu. */
const LEMAK_MINIMAL_PER_KG = 0.8;

/** Batas bawah AMDR untuk lemak, dihitung dari total energi. */
const LEMAK_MINIMAL_RASIO_ENERGI = 0.2;

export interface MacroTarget {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Membagi budget kalori jadi tiga makronutrien.
 *
 * Urutannya disengaja: protein dulu, lalu lemak, sisanya karbohidrat.
 *
 * Protein didahulukan karena dialah yang menentukan apakah berat yang hilang itu
 * lemak atau otot. Menurunkan berat badan itu mudah; menurunkannya tanpa ikut
 * kehilangan otot yang justru menjaga metabolisme tetap tinggi, itu yang sulit —
 * dan protein adalah pengungkit utamanya.
 *
 * Lemak menyusul karena punya batas bawah fisiologis yang tidak boleh ditembus.
 * Karbohidrat dapat sisanya karena dia satu-satunya yang tidak esensial.
 */
export const macroTarget = (
  calorieBudget: number,
  weightKg: number,
  isDeficit: boolean,
): MacroTarget => {
  const perKg = isDeficit ? PROTEIN_PER_KG_DEFISIT : PROTEIN_PER_KG_NORMAL;

  const proteinMaksimal = (calorieBudget * PROTEIN_MAKSIMAL_RASIO_ENERGI) / KKAL_PER_G_PROTEIN;
  const protein = Math.min(weightKg * perKg, proteinMaksimal);

  const lemak = Math.max(
    weightKg * LEMAK_MINIMAL_PER_KG,
    (calorieBudget * LEMAK_MINIMAL_RASIO_ENERGI) / KKAL_PER_G_LEMAK,
  );

  const sisa = calorieBudget - protein * KKAL_PER_G_PROTEIN - lemak * KKAL_PER_G_LEMAK;

  // Budget yang sangat ketat bisa habis sebelum sampai karbohidrat. Membiarkannya
  // negatif akan menghasilkan anjuran yang mustahil dijalankan, jadi ditahan nol.
  return {
    protein_g: round(protein, 0),
    fat_g: round(lemak, 0),
    carbs_g: round(Math.max(sisa, 0) / KKAL_PER_G_KARBO, 0),
  };
};

// ============================================================
// GABUNGAN
// ============================================================

export interface DailyTargets {
  water_ml: number;
  sleep: SleepTarget;
  steps: StepTarget;
  /** Null selama user belum punya target berat badan yang aktif. */
  macros: MacroTarget | null;
}

export interface TargetInput {
  weightKg: number;
  age: number;
  gender: Gender;
  /** Budget kalori dari goal aktif. Null kalau belum ada goal. */
  calorieBudget: number | null;
  /** True kalau budget itu memang di bawah TDEE. */
  isDeficit: boolean;
  /** Langkah tambahan yang dibutuhkan target berat badan. */
  extraStepsForGoal: number;
  /** Menit olahraga hari ini, menaikkan kebutuhan cairan. */
  workoutMinutes: number;
}

/** Semua target harian sekaligus, supaya layar tidak perlu menghitung apa pun. */
export const dailyTargets = (input: TargetInput): DailyTargets => ({
  water_ml: waterTargetMl(input.weightKg, input.age, input.workoutMinutes),
  sleep: sleepTarget(input.age),
  steps: stepTarget(input.age, input.extraStepsForGoal),
  macros:
    input.calorieBudget === null
      ? null
      : macroTarget(input.calorieBudget, input.weightKg, input.isDeficit),
});
