import { ACTIVITY_MULTIPLIER, type ActivityLevel, type Gender } from '../constants/enums.js';
import { round } from './number.js';

/**
 * Semua kalkulasi kalori terpusat di sini. Lihat CLAUDE.md section 8.
 *
 * Angka-angka di bawah adalah ESTIMASI POPULASI, bukan pengukuran. Mifflin-St Jeor
 * meleset sekitar 10% untuk kebanyakan orang dan lebih jauh lagi untuk yang
 * komposisi tubuhnya tidak biasa. Dipakai untuk memberi titik awal yang masuk akal,
 * bukan untuk diperlakukan sebagai kebenaran.
 */

/** Usia dalam tahun penuh pada tanggal tertentu. */
export const calculateAge = (birthDate: string, at: Date = new Date()): number => {
  const lahir = new Date(birthDate);

  let usia = at.getFullYear() - lahir.getFullYear();

  // Kurangi satu kalau ulang tahunnya belum lewat di tahun ini.
  const bulanBerlalu = at.getMonth() - lahir.getMonth();
  if (bulanBerlalu < 0 || (bulanBerlalu === 0 && at.getDate() < lahir.getDate())) {
    usia -= 1;
  }

  return usia;
};

export interface BmrInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
}

/**
 * Basal Metabolic Rate dengan rumus Mifflin-St Jeor.
 *
 * Rumus aslinya cuma mendefinisikan dua varian, pria dan wanita, yang selisihnya
 * ada di konstanta terakhir: +5 dan -161. Untuk gender OTHER dipakai titik tengah
 * keduanya (-78) — bukan angka dari literatur, melainkan pilihan yang menghindari
 * memaksa siapa pun masuk ke kategori yang tidak sesuai, dengan galat yang tidak
 * lebih besar daripada galat bawaan rumusnya sendiri.
 */
export const calculateBMR = ({ weightKg, heightCm, age, gender }: BmrInput): number => {
  const dasar = 10 * weightKg + 6.25 * heightCm - 5 * age;

  const konstanta = gender === 'MALE' ? 5 : gender === 'FEMALE' ? -161 : -78;

  return round(dasar + konstanta, 0);
};

/** Total Daily Energy Expenditure: BMR dikali pengali level aktivitas. */
export const calculateTDEE = (bmr: number, activityLevel: ActivityLevel): number =>
  round(bmr * ACTIVITY_MULTIPLIER[activityLevel], 0);

/** Estimasi kalori terbakar dari jumlah langkah. */
export const caloriesFromSteps = (steps: number, weightKg: number): number =>
  round(steps * weightKg * 0.0005, 0);

/** Estimasi jarak tempuh, mengasumsikan panjang langkah rata-rata 80cm. */
export const distanceFromSteps = (steps: number): number => round(steps * 0.0008, 3);

/**
 * Kalori olahraga, di-scale dari nilai library.
 * Nilai di library adalah estimasi untuk berat badan 70kg.
 */
export const caloriesFromWorkout = (
  caloriesPerMinute: number,
  durationMinutes: number,
  weightKg: number,
): number => round(caloriesPerMinute * durationMinutes * (weightKg / 70), 0);

/** Perkiraan energi yang tersimpan dalam 1 kg lemak tubuh, dalam kilokalori. */
const KALORI_PER_KG_LEMAK = 7700;

/**
 * Batas bawah asupan harian. Di bawah angka ini, kebutuhan mikronutrien sulit
 * terpenuhi dan penurunan berat badan cenderung mengorbankan massa otot.
 *
 * Angka ini membuat target yang terlalu agresif TIDAK menghasilkan anjuran yang
 * membahayakan — budget-nya ditahan di batas aman, dan selisihnya dilaporkan
 * lewat `achievable` supaya user tahu targetnya tidak realistis.
 */
const BATAS_BAWAH_KALORI = 1200;

export interface CalorieBudgetInput {
  tdee: number;
  currentWeightKg: number;
  targetWeightKg: number;
  /** Jumlah hari tersisa menuju target. */
  daysRemaining: number;
}

export interface CalorieBudget {
  daily_calorie_budget: number;
  /** Defisit harian yang benar-benar dipakai setelah ditahan batas bawah. */
  daily_deficit: number;
  /** Defisit yang sebenarnya dibutuhkan untuk mencapai target tepat waktu. */
  required_deficit: number;
  /** False kalau target hanya bisa dicapai dengan asupan di bawah batas aman. */
  achievable: boolean;
}

/**
 * Menghitung budget kalori harian dari target berat badan.
 *
 * Untuk target menaikkan berat badan, hasilnya surplus (defisit negatif) dan
 * batas bawah tidak berlaku.
 */
export const calculateCalorieBudget = ({
  tdee,
  currentWeightKg,
  targetWeightKg,
  daysRemaining,
}: CalorieBudgetInput): CalorieBudget => {
  const selisihKg = currentWeightKg - targetWeightKg;

  // Target di hari yang sama atau sudah lewat: tidak ada waktu tersisa untuk
  // menyebar defisit, jadi pakai TDEE apa adanya daripada membagi dengan nol.
  const hari = Math.max(daysRemaining, 1);

  const defisitDibutuhkan = round((selisihKg * KALORI_PER_KG_LEMAK) / hari, 0);
  const budgetIdeal = round(tdee - defisitDibutuhkan, 0);

  const budget = Math.max(budgetIdeal, BATAS_BAWAH_KALORI);

  return {
    daily_calorie_budget: budget,
    daily_deficit: round(tdee - budget, 0),
    required_deficit: defisitDibutuhkan,
    achievable: budgetIdeal >= BATAS_BAWAH_KALORI,
  };
};

/** Selisih hari penuh antara dua tanggal YYYY-MM-DD. */
export const daysBetween = (from: string, to: string): number => {
  const mulai = new Date(`${from}T00:00:00Z`).getTime();
  const selesai = new Date(`${to}T00:00:00Z`).getTime();

  return Math.round((selesai - mulai) / (1000 * 60 * 60 * 24));
};
