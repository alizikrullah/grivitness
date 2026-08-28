import { z } from 'zod';

import { WORKOUT_CATEGORY, WORKOUT_INTENSITY } from '../../constants/enums.js';
import { dateString } from '../../utils/query.js';

/**
 * Sebuah log olahraga bisa bersumber dari tiga tempat, dan sumbernya menentukan
 * dari mana nama serta kalorinya berasal:
 *
 *   workout_library_id -> dipilih dari library global
 *   custom_workout_id  -> dipilih dari custom workout milik user
 *   keduanya kosong     -> input manual, user mengisi nama dan kalorinya sendiri
 *
 * Aturan itu ditegakkan di sini supaya service tidak menerima kombinasi yang
 * tidak masuk akal, misalnya dua sumber sekaligus atau tidak ada sumber sama
 * sekali tanpa nama olahraga.
 */
export const CreateWorkoutSchema = z
  .object({
    workout_library_id: z.uuid({ message: 'Id library tidak valid' }).optional(),
    custom_workout_id: z.uuid({ message: 'Id custom workout tidak valid' }).optional(),

    /** Wajib untuk input manual, diabaikan kalau sumbernya library atau custom. */
    workout_name: z.string().trim().min(2, 'Nama olahraga minimal 2 karakter').max(255).optional(),

    duration_minutes: z
      .number({ message: 'Durasi harus berupa angka' })
      .int('Durasi harus bilangan bulat')
      .min(1, 'Durasi minimal 1 menit')
      .max(1440, 'Durasi maksimal 1440 menit'),

    /** Wajib untuk input manual. Kalau dari library atau custom, dihitung backend. */
    calories_burned: z
      .number({ message: 'Kalori harus berupa angka' })
      .int('Kalori harus bilangan bulat')
      .min(0, 'Kalori tidak boleh negatif')
      .max(20_000, 'Kalori tidak masuk akal')
      .optional(),

    intensity: z.enum(WORKOUT_INTENSITY),

    /**
     * true kalau sesi ini SUDAH ikut terhitung di angka smartwatch hari itu.
     *
     * Menentukan apakah kalorinya boleh ditambahkan di atas angka perangkat.
     * Jalan santai dan berkebun yang dilakukan sambil memakai jam tangan sudah
     * masuk di sana; berenang atau sesi yang jamnya dilepas belum.
     */
    tracked_by_device: z.boolean().optional(),

    notes: z.string().trim().max(1000).optional(),
    logged_at: dateString.optional(),
  })
  .superRefine((data, ctx) => {
    const sumber = [data.workout_library_id, data.custom_workout_id].filter(Boolean);

    if (sumber.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['custom_workout_id'],
        message: 'Pilih salah satu saja: dari library atau dari custom workout',
      });
      return;
    }

    // Input manual: nama dan kalori harus diisi sendiri karena tidak ada
    // sumber yang bisa dirujuk untuk mengisinya.
    if (sumber.length === 0) {
      if (!data.workout_name) {
        ctx.addIssue({
          code: 'custom',
          path: ['workout_name'],
          message: 'Isi nama olahraga, atau pilih dari library / custom workout',
        });
      }
      if (data.calories_burned === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['calories_burned'],
          message: 'Isi kalori terbakar untuk olahraga yang diinput manual',
        });
      }
    }
  });

/**
 * Koreksi log olahraga yang sudah tercatat.
 *
 * Sumbernya (library / custom / manual) tidak bisa diubah, mengganti sumber
 * berarti olahraga yang berbeda, dan itu catatan baru, bukan penyuntingan.
 */
export const UpdateWorkoutSchema = z
  .object({
    workout_name: z.string().trim().min(2, 'Nama olahraga minimal 2 karakter').max(255).optional(),

    duration_minutes: z
      .number({ message: 'Durasi harus berupa angka' })
      .int('Durasi harus bilangan bulat')
      .min(1, 'Durasi minimal 1 menit')
      .max(1440, 'Durasi maksimal 1440 menit')
      .optional(),

    calories_burned: z
      .number({ message: 'Kalori harus berupa angka' })
      .int('Kalori harus bilangan bulat')
      .min(0, 'Kalori tidak boleh negatif')
      .max(20_000, 'Kalori tidak masuk akal')
      .optional(),

    intensity: z.enum(WORKOUT_INTENSITY).optional(),
    tracked_by_device: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export const CreateCustomWorkoutSchema = z.object({
  name: z.string().trim().min(2, 'Nama olahraga minimal 2 karakter').max(255),
  category: z.enum(WORKOUT_CATEGORY),
  calories_burned_per_minute: z
    .number({ message: 'Kalori per menit harus berupa angka' })
    .min(0.1, 'Kalori per menit minimal 0.1')
    .max(100, 'Kalori per menit maksimal 100')
    // Nilai ini adalah estimasi untuk berat badan 70kg, sama seperti library
    // global. Backend yang men-scale-nya sesuai berat user saat mencatat log.
    .transform((value) => value.toFixed(2)),
  description: z.string().trim().max(1000).optional(),
});

export const LibraryQuerySchema = z.object({
  category: z.enum(WORKOUT_CATEGORY).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CreateWorkoutDto = z.infer<typeof CreateWorkoutSchema>;
export type UpdateWorkoutDto = z.infer<typeof UpdateWorkoutSchema>;
export type CreateCustomWorkoutDto = z.infer<typeof CreateCustomWorkoutSchema>;
export type LibraryQueryDto = z.infer<typeof LibraryQuerySchema>;
