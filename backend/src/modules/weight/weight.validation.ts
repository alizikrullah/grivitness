import { z } from 'zod';

import { dateString } from '../../utils/query.js';

const weightKg = z
  .number({ message: 'Berat badan harus berupa angka' })
  .min(20, 'Berat badan minimal 20 kg')
  .max(400, 'Berat badan maksimal 400 kg')
  // Directus menyimpan decimal sebagai string, jadi dikonversi di sini supaya
  // service tidak perlu memikirkannya lagi.
  .transform((value) => value.toFixed(2));

export const CreateWeightSchema = z.object({
  weight_kg: weightKg,
  /** Default hari ini menurut WIB, supaya client tidak wajib mengirimnya. */
  logged_at: dateString.optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const UpdateWeightSchema = z
  .object({
    weight_kg: weightKg.optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  // logged_at sengaja tidak bisa diubah. Tanggal ikut menentukan user_date_key
  // yang menjaga aturan satu log per hari, jadi memindahkannya berarti
  // memindahkan kunci uniknya juga. Hapus lalu buat baru kalau salah tanggal.
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type CreateWeightDto = z.infer<typeof CreateWeightSchema>;
export type UpdateWeightDto = z.infer<typeof UpdateWeightSchema>;
