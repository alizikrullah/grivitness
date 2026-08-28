import { z } from 'zod';

import { dateString } from '../../utils/query.js';

/** Skala 1-5. Dijamin di sini, bukan di database, Directus tidak punya enum. */
const skor = (label: string) =>
  z
    .number({ message: `${label} harus berupa angka` })
    .int(`${label} harus bilangan bulat`)
    .min(1, `${label} antara 1 sampai 5`)
    .max(5, `${label} antara 1 sampai 5`);

export const CreateMoodSchema = z.object({
  mood_score: skor('Skor mood'),
  energy_score: skor('Skor energi'),
  notes: z.string().trim().max(1000).optional(),
  logged_at: dateString.optional(),
});

export const UpdateMoodSchema = z
  .object({
    mood_score: skor('Skor mood').optional(),
    energy_score: skor('Skor energi').optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type CreateMoodDto = z.infer<typeof CreateMoodSchema>;
export type UpdateMoodDto = z.infer<typeof UpdateMoodSchema>;
