import { z } from 'zod';

export const CreateWaterSchema = z.object({
  amount_ml: z
    .number({ message: 'Jumlah air harus berupa angka' })
    .int('Jumlah air harus bilangan bulat')
    .min(1, 'Jumlah air minimal 1 ml')
    .max(5000, 'Jumlah air maksimal 5000 ml sekali catat'),

  /**
   * Timestamp lengkap, bukan tanggal saja, user bisa mencatat berkali-kali
   * sehari dan urutan jamnya berarti. Default waktu sekarang.
   */
  logged_at: z.iso.datetime({ message: 'logged_at harus timestamp ISO 8601' }).optional(),
});

/** Koreksi tegukan yang sudah tercatat. Waktunya ikut bisa dibetulkan. */
export const UpdateWaterSchema = z
  .object({
    amount_ml: CreateWaterSchema.shape.amount_ml.optional(),
    logged_at: CreateWaterSchema.shape.logged_at,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type CreateWaterDto = z.infer<typeof CreateWaterSchema>;
export type UpdateWaterDto = z.infer<typeof UpdateWaterSchema>;
