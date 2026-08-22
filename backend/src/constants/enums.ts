/**
 * Sumber kebenaran semua enum GriviTness.
 *
 * Dipakai di tiga tempat sekaligus:
 *   1. directus/schema.ts   — jadi dropdown choices di collection Directus
 *   2. *.validation.ts      — jadi z.enum() yang memvalidasi request masuk
 *   3. types/              — jadi tipe TypeScript
 *
 * Directus tidak punya tipe enum Postgres, jadi di database ini cuma kolom string.
 * Jaminan nilainya benar-benar ada di Zod, bukan di database. Karena itu setiap
 * field enum WAJIB divalidasi Zod sebelum menyentuh Directus.
 */

export const GENDER = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDER)[number];

/** Menentukan activity multiplier pada kalkulasi TDEE. Lihat CLAUDE.md section 8. */
export const ACTIVITY_LEVEL = [
  'SEDENTARY',
  'LIGHTLY_ACTIVE',
  'MODERATELY_ACTIVE',
  'VERY_ACTIVE',
  'EXTRA_ACTIVE',
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVEL)[number];

export const MEAL_TYPE = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export type MealType = (typeof MEAL_TYPE)[number];

export const WORKOUT_INTENSITY = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type WorkoutIntensity = (typeof WORKOUT_INTENSITY)[number];

export const WORKOUT_CATEGORY = ['CARDIO', 'STRENGTH', 'FLEXIBILITY', 'SPORTS', 'OTHER'] as const;
export type WorkoutCategory = (typeof WORKOUT_CATEGORY)[number];

/** Angka pengali TDEE per level aktivitas. */
export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHTLY_ACTIVE: 1.375,
  MODERATELY_ACTIVE: 1.55,
  VERY_ACTIVE: 1.725,
  EXTRA_ACTIVE: 1.9,
};
