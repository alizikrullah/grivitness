import { z } from 'zod';

import { MEAL_TYPE } from '../../constants/enums.js';
import { dateString } from '../../utils/query.js';

/**
 * Request-nya multipart, jadi seluruh field datang sebagai string, termasuk
 * angka. Karena itu dipakai z.coerce, bukan z.number seperti di endpoint JSON.
 */
export const CreateFoodSchema = z.object({
  meal_type: z.enum(MEAL_TYPE, { message: 'meal_type harus BREAKFAST, LUNCH, DINNER, atau SNACK' }),

  notes: z.string().trim().max(1000).optional(),

  /** Timestamp lengkap supaya urutan makan dalam sehari bisa diurutkan. */
  logged_at: z.iso.datetime({ message: 'logged_at harus timestamp ISO 8601' }).optional(),

  /**
   * Nilai gizi hasil analisa AI boleh ditimpa manual oleh user. AI mengestimasi
   * dari foto dan bisa meleset jauh, user yang tahu isi piringnya berhak
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

/**
 * Koreksi manual atas hasil analisa AI.
 *
 * Berbeda dari CreateFoodSchema, request ini JSON biasa, fotonya tidak ikut
 * dikirim ulang, jadi angkanya memakai z.number(), bukan z.coerce.
 *
 * `foods_detected` ikut bisa diubah karena di situlah kekeliruan AI paling
 * terasa: salah menyebut nama hidangan. Membiarkan user cuma menghapus lalu
 * memotret ulang berarti memaksa satu panggilan AI lagi hanya untuk membetulkan
 * satu kata.
 */
export const UpdateFoodSchema = z
  .object({
    meal_type: z
      .enum(MEAL_TYPE, { message: 'meal_type harus BREAKFAST, LUNCH, DINNER, atau SNACK' })
      .optional(),

    notes: z.string().trim().max(1000).nullable().optional(),

    foods_detected: z
      .array(z.string().trim().min(1, 'Nama makanan tidak boleh kosong').max(120))
      .max(30, 'Maksimal 30 item makanan')
      .optional(),

    total_calories: z.number().int().min(0).max(20_000).optional(),
    protein_g: z.number().min(0).max(2000).optional(),
    carbs_g: z.number().min(0).max(2000).optional(),
    fat_g: z.number().min(0).max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type CreateFoodDto = z.infer<typeof CreateFoodSchema>;
export type FoodDateDto = z.infer<typeof FoodDateSchema>;
export type UpdateFoodDto = z.infer<typeof UpdateFoodSchema>;
