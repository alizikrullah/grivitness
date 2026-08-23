import type { ActivityLevel, Gender, MealType, WorkoutCategory, WorkoutIntensity } from '@/types';

/**
 * Terjemahan enum backend ke bahasa yang dibaca user.
 *
 * Nilai enum tetap dikirim ke API dalam bentuk aslinya — yang berubah hanya
 * tampilannya. Menerjemahkan nilai sebelum dikirim akan ditolak Zod di backend.
 */
export const GENDER_LABEL: Record<Gender, string> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
  OTHER: 'Lainnya',
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  SEDENTARY: 'Jarang bergerak',
  LIGHTLY_ACTIVE: 'Sedikit aktif',
  MODERATELY_ACTIVE: 'Cukup aktif',
  VERY_ACTIVE: 'Sangat aktif',
  EXTRA_ACTIVE: 'Ekstra aktif',
};

export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  SEDENTARY: 'Kerja duduk, hampir tidak olahraga',
  LIGHTLY_ACTIVE: 'Olahraga ringan 1-3 hari seminggu',
  MODERATELY_ACTIVE: 'Olahraga sedang 3-5 hari seminggu',
  VERY_ACTIVE: 'Olahraga berat 6-7 hari seminggu',
  EXTRA_ACTIVE: 'Olahraga berat tiap hari atau pekerjaan fisik',
};

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Sarapan',
  LUNCH: 'Makan siang',
  DINNER: 'Makan malam',
  SNACK: 'Camilan',
};

export const INTENSITY_LABEL: Record<WorkoutIntensity, string> = {
  LOW: 'Ringan',
  MEDIUM: 'Sedang',
  HIGH: 'Berat',
};

export const CATEGORY_LABEL: Record<WorkoutCategory, string> = {
  CARDIO: 'Kardio',
  STRENGTH: 'Kekuatan',
  FLEXIBILITY: 'Kelenturan',
  SPORTS: 'Olahraga',
  OTHER: 'Lainnya',
};

export const SCORE_LABEL: Record<'mood' | 'energy' | 'sleep', Record<number, string>> = {
  mood: { 1: 'Sangat buruk', 2: 'Buruk', 3: 'Biasa', 4: 'Baik', 5: 'Sangat baik' },
  energy: { 1: 'Sangat lelah', 2: 'Lelah', 3: 'Cukup', 4: 'Berenergi', 5: 'Sangat berenergi' },
  sleep: { 1: 'Sangat buruk', 2: 'Buruk', 3: 'Cukup', 4: 'Nyenyak', 5: 'Sangat nyenyak' },
};

export const GENDER_OPTIONS = Object.keys(GENDER_LABEL) as Gender[];
export const ACTIVITY_OPTIONS = Object.keys(ACTIVITY_LABEL) as ActivityLevel[];
export const MEAL_OPTIONS = Object.keys(MEAL_LABEL) as MealType[];
export const INTENSITY_OPTIONS = Object.keys(INTENSITY_LABEL) as WorkoutIntensity[];
export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as WorkoutCategory[];
