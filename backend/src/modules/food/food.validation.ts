import { z } from 'zod';

import { FOOD_UNIT, MEAL_TYPE } from '../../constants/enums.js';
import { dateString } from '../../utils/query.js';

/**
 * Satu makanan di dalam sesi makan, seperti yang ditulis user.
 *
 * Nama dan jumlah porsi datang dari user dan TIDAK pernah ditebak model.
 * Berat per porsi opsional: kalau ada foto, model menaksirnya dari foto; kalau
 * tidak ada foto, wajib diisi (diperiksa di service, karena baru di sana
 * diketahui ada fotonya atau tidak).
 *
 * Ini yang menutup keluhan "saya tulis 2 pcs tapi dihitung 1": jumlahnya
 * kolom angka yang dikalikan backend, bukan kalimat yang harus ditafsirkan
 * model dan bisa diabaikan.
 */
const FoodItemSchema = z.object({
  name: z.string().trim().min(1, 'Nama makanan tidak boleh kosong').max(120),

  /** Boleh pecahan: setengah porsi nasi itu wajar. */
  portions: z.coerce
    .number({ message: 'Jumlah porsi harus berupa angka' })
    .positive('Jumlah porsi harus lebih dari nol')
    .max(50, 'Jumlah porsi tidak masuk akal'),

  /** Berat atau volume SATU porsi, dalam satuan `unit`. */
  weight: z.coerce
    .number({ message: 'Berat harus berupa angka' })
    .positive('Berat harus lebih dari nol')
    .max(5000, 'Berat per porsi tidak masuk akal')
    .optional(),

  unit: z.enum(FOOD_UNIT, { message: 'Satuan harus g atau ml' }).default('g'),

  /**
   * Nilai gizi SATU porsi dari kemasan. Kalau ada, model tidak menaksir gizi
   * item ini sama sekali. Kalori wajib, makro opsional. Dikalikan jumlah porsi
   * oleh backend.
   */
  label: z
    .object({
      kcal: z.coerce
        .number({ message: 'Kalori kemasan harus berupa angka' })
        .min(0)
        .max(5000, 'Kalori per porsi tidak masuk akal, cek satuannya'),
      protein_g: z.coerce.number().min(0).max(500).optional(),
      carbs_g: z.coerce.number().min(0).max(500).optional(),
      fat_g: z.coerce.number().min(0).max(500).optional(),
    })
    .optional(),
});

/**
 * Daftar item bisa datang dalam dua bentuk:
 *   - JSON biasa (tanpa foto): array langsung
 *   - multipart (dengan foto): string JSON di field "items", karena multipart
 *     hanya membawa string
 *
 * Keduanya diterima di sini supaya client tidak perlu dua jalur.
 */
const daftarItem = z.preprocess(
  (nilai) => {
    if (typeof nilai !== 'string') return nilai;
    try {
      return JSON.parse(nilai) as unknown;
    } catch {
      return nilai;
    }
  },
  z
    .array(FoodItemSchema, { message: 'items harus berupa daftar makanan' })
    .min(1, 'Tulis minimal satu makanan')
    .max(20, 'Maksimal 20 makanan dalam satu sesi'),
);

export const CreateFoodSchema = z.object({
  meal_type: z.enum(MEAL_TYPE, { message: 'meal_type harus BREAKFAST, LUNCH, DINNER, atau SNACK' }),

  items: daftarItem,

  /** Timestamp lengkap supaya urutan makan dalam sehari bisa diurutkan. */
  logged_at: z.iso.datetime({ message: 'logged_at harus timestamp ISO 8601' }).optional(),
});

/** Pencarian saran nama. Kosong berarti yang paling sering dicatat. */
export const FoodSuggestionSchema = z.object({
  q: z.string().trim().max(120).optional(),
});

export type FoodSuggestionDto = z.infer<typeof FoodSuggestionSchema>;

export const FoodDateSchema = z.object({
  date: dateString.optional(),
});

/**
 * Koreksi sesi makan yang sudah tercatat, TANPA memanggil model lagi.
 *
 * Nilai gizi per 100 g/ml tiap item sudah tersimpan dari analisa pertama,
 * jadi mengubah nama, jumlah porsi, atau berat cukup dihitung ulang backend.
 * Berat boleh dikosongkan, berat yang tersimpan yang dipakai. Angka kemasan
 * boleh ditambahkan di sini, itu justru cara membetulkan taksiran yang
 * meleset tanpa memanggil model. Menambah makanan yang belum pernah
 * dianalisa tidak bisa lewat sini, itu sesi baru.
 */
const FoodItemEditSchema = FoodItemSchema;

export const UpdateFoodSchema = z
  .object({
    meal_type: z
      .enum(MEAL_TYPE, { message: 'meal_type harus BREAKFAST, LUNCH, DINNER, atau SNACK' })
      .optional(),

    items: z
      .array(FoodItemEditSchema)
      .min(1, 'Minimal satu makanan')
      .max(20, 'Maksimal 20 makanan dalam satu sesi')
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type FoodItemDto = z.infer<typeof FoodItemSchema>;
export type FoodItemEditDto = z.infer<typeof FoodItemEditSchema>;
export type CreateFoodDto = z.infer<typeof CreateFoodSchema>;
export type FoodDateDto = z.infer<typeof FoodDateSchema>;
export type UpdateFoodDto = z.infer<typeof UpdateFoodSchema>;
