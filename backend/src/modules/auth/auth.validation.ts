import { z } from 'zod';

/**
 * Skema validasi request untuk endpoint auth.
 * Semua request masuk lewat validate.middleware sebelum menyentuh controller.
 */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Format email tidak valid' }));

/**
 * bcrypt hanya membaca 72 byte pertama dan MEMBUANG sisanya tanpa peringatan.
 * Password 100 karakter akan diperlakukan sama dengan 72 karakter pertamanya,
 * jadi batasnya ditegakkan di sini supaya perilakunya jujur ke user.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(72, 'Password maksimal 72 karakter');

export const RegisterSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100, 'Nama maksimal 100 karakter'),
});

export const LoginSchema = z.object({
  email: emailSchema,
  // Sengaja tidak memakai aturan panjang seperti saat register. Kalau password
  // lama tidak memenuhi aturan baru, user tetap harus bisa login.
  password: z.string().min(1, 'Password wajib diisi'),
});

export const RefreshSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token wajib diisi'),
});

export const LogoutSchema = z.object({
  refresh_token: z.string().min(1, 'refresh_token wajib diisi'),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshDto = z.infer<typeof RefreshSchema>;
export type LogoutDto = z.infer<typeof LogoutSchema>;
