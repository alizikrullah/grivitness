import { z } from 'zod';

export const CreateWaterSchema = z.object({
  amount_ml: z
    .number({ message: 'Jumlah air harus berupa angka' })
    .int('Jumlah air harus bilangan bulat')
    .min(1, 'Jumlah air minimal 1 ml')
    .max(5000, 'Jumlah air maksimal 5000 ml sekali catat'),

  /**
   * Timestamp lengkap, bukan tanggal saja — user bisa mencatat berkali-kali
   * sehari dan urutan jamnya berarti. Default waktu sekarang.
   */
  logged_at: z.iso.datetime({ message: 'logged_at harus timestamp ISO 8601' }).optional(),
});

export type CreateWaterDto = z.infer<typeof CreateWaterSchema>;
