import { z } from 'zod';

import { dateString } from '../../utils/query.js';

/**
 * Semua ukuran nullable, user boleh mengisi sebagian saja, misalnya cuma
 * pinggang. Nilai dikonversi ke string karena Directus menyimpan decimal
 * sebagai string.
 */
const ukuran = (label: string) =>
  z
    .number({ message: `${label} harus berupa angka` })
    .min(10, `${label} minimal 10 cm`)
    .max(300, `${label} maksimal 300 cm`)
    .transform((value) => value.toFixed(2))
    .optional();

const bagian = {
  waist_cm: ukuran('Lingkar pinggang'),
  hips_cm: ukuran('Lingkar pinggul'),
  chest_cm: ukuran('Lingkar dada'),
  left_arm_cm: ukuran('Lingkar lengan kiri'),
  right_arm_cm: ukuran('Lingkar lengan kanan'),
  left_thigh_cm: ukuran('Lingkar paha kiri'),
  right_thigh_cm: ukuran('Lingkar paha kanan'),
};

const NAMA_BAGIAN = Object.keys(bagian);

export const CreateMeasurementSchema = z
  .object({ ...bagian, logged_at: dateString.optional() })
  // Mencatat baris tanpa satu ukuran pun tidak ada gunanya, dan akan memakai
  // jatah user_date_key hari itu sehingga pencatatan yang benar jadi tertolak.
  .refine((data) => NAMA_BAGIAN.some((nama) => data[nama as keyof typeof data] !== undefined), {
    message: 'Isi minimal satu ukuran badan',
  });

export const UpdateMeasurementSchema = z
  .object(bagian)
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type CreateMeasurementDto = z.infer<typeof CreateMeasurementSchema>;
export type UpdateMeasurementDto = z.infer<typeof UpdateMeasurementSchema>;
