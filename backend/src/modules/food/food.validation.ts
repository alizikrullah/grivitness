import { z } from 'zod';

import { MEAL_TYPE } from '../../constants/enums.js';
import { dateString } from '../../utils/query.js';

/**
 * Request-nya multipart, jadi seluruh field datang sebagai string — termasuk
 * angka. Karena itu dipakai z.coerce, bukan z.number seperti di endpoint JSON.
 */
export const CreateFoodSchema = z.object({
  meal_type: z.enum(MEAL_TYPE, { message: 'meal_type harus BREAKFAST, LUNCH, DINNER, atau SNACK' }),

  notes: z.string().trim().max(1000).optional(),

  /** Timestamp lengkap supaya urutan makan dalam sehari bisa diurutkan. */
  logged_at: z.iso.datetime({ message: 'logged_at harus timestamp ISO 8601' }).optional(),

  /**
   * Nilai gizi hasil analisa AI boleh ditimpa manual oleh user. AI mengestimasi
   * dari foto dan bisa meleset jauh — user yang tahu isi piringnya berhak
   * mengoreksi. Kalau dikosongkan, hasil AI yang dipakai.
   */
  total_calories: z.coerce.number().int().min(0).max(20_000).optional(),
  protein_g: z.coerce.number().min(0).max(2000).optional(),
  carbs_g: z.coerce.number().min(0).max(2000).optional(),
  fat_g: z.coerce.number().min(0).max(2000).optional(),
});

export const FoodDateSchema = z.object({
  date: dateString.optional(),
});

export type CreateFoodDto = z.infer<typeof CreateFoodSchema>;
export type FoodDateDto = z.infer<typeof FoodDateSchema>;
