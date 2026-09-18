import { z } from 'zod';

import { dateString } from '../../utils/query.js';

/**
 * Cuma lingkar pinggang.
 *
 * Dulu ada tujuh lingkar dan semuanya opsional, dan itu yang membuat fiturnya
 * mengganggu: tujuh kolom kosong yang terasa seperti PR, untuk angka yang
 * tidak dipakai hitungan mana pun. Dari semuanya cuma pinggang yang punya
 * bukti kuat, WHO dan NIH memakainya sebagai penanda lemak perut terlepas
 * dari berat badan, dan cuma pinggang yang berguna saat timbangan macet.
 *
 * Nilai dikonversi ke string karena Directus menyimpan decimal sebagai string.
 */
const pinggang = z
  .number({ message: 'Lingkar pinggang harus berupa angka' })
  .min(30, 'Lingkar pinggang minimal 30 cm')
  .max(300, 'Lingkar pinggang maksimal 300 cm')
  .transform((value) => value.toFixed(2));

export const CreateMeasurementSchema = z.object({
  waist_cm: pinggang,
  logged_at: dateString.optional(),
});

export const UpdateMeasurementSchema = z.object({
  waist_cm: pinggang,
});

export type CreateMeasurementDto = z.infer<typeof CreateMeasurementSchema>;
export type UpdateMeasurementDto = z.infer<typeof UpdateMeasurementSchema>;
