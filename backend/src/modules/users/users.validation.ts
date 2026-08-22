import { z } from 'zod';

import { ACTIVITY_LEVEL, GENDER } from '../../constants/enums.js';

/**
 * Nilai decimal dikirim client sebagai number, tapi Directus menyimpannya
 * sebagai string. Konversi dilakukan di sini supaya service tidak perlu
 * memikirkannya lagi.
 */
const decimalString = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label} harus berupa angka` })
    .min(min, `${label} minimal ${min}`)
    .max(max, `${label} maksimal ${max}`)
    .transform((value) => value.toFixed(2));

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Tanggal tidak valid');

export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100).optional(),
  })
  // Email sengaja TIDAK bisa diubah di sini. Mengubah email berarti menyentuh
  // identitas login dan cerminan di directus_users sekaligus, jadi butuh alur
  // tersendiri dengan verifikasi — bukan sekadar PATCH biasa.
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

const profileFields = {
  height_cm: decimalString(50, 260, 'Tinggi badan'),
  birth_date: dateString.refine((value) => {
    const usia = (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return usia >= 10 && usia <= 120;
  }, 'Tanggal lahir tidak masuk akal'),
  gender: z.enum(GENDER),
  activity_level: z.enum(ACTIVITY_LEVEL),
};

export const CreateProfileSchema = z.object(profileFields);

export const UpdateProfileSchema = z
  .object({
    height_cm: profileFields.height_cm.optional(),
    birth_date: profileFields.birth_date.optional(),
    gender: profileFields.gender.optional(),
    activity_level: profileFields.activity_level.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
export type CreateProfileDto = z.infer<typeof CreateProfileSchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
