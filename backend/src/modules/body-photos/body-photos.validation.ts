import { z } from 'zod';

import { dateString } from '../../utils/query.js';

export const CreateBodyPhotoSchema = z.object({
  logged_at: dateString.optional(),
});

/**
 * Dua tanggal yang dibandingkan. Keduanya harus punya foto badan, dan `from`
 * harus lebih dulu dari `to`, diperiksa di sini supaya "sesudah" dan
 * "sebelum" tidak pernah tertukar di prompt maupun di layar.
 */
export const ComparePhotosSchema = z
  .object({
    from: dateString,
    to: dateString,
  })
  .refine((data) => data.from < data.to, {
    message: 'Tanggal "from" harus lebih dulu dari "to"',
    path: ['from'],
  });

export type CreateBodyPhotoDto = z.infer<typeof CreateBodyPhotoSchema>;
export type ComparePhotosDto = z.infer<typeof ComparePhotosSchema>;
