import { createDirectus, rest, staticToken } from '@directus/sdk';

import type { DirectusSchema } from '../types/directus-schema.js';
import { env } from './env.js';

/**
 * Client Directus tunggal untuk seluruh aplikasi.
 *
 * Memakai static token milik admin, jadi backend punya akses penuh ke semua data.
 * Konsekuensinya: **pembatasan akses per user sepenuhnya tanggung jawab service layer.**
 * Directus tidak menyaring apapun untuk kita.
 *
 * Artinya setiap query yang mengambil data milik user WAJIB menyertakan filter
 * `user_id` secara eksplisit. Kalau lupa, user A bisa membaca data user B.
 *
 * Contoh yang BENAR:
 *   readItems('weight_logs', { filter: { user_id: { _eq: userId } } })
 *
 * Contoh yang SALAH — mengembalikan data semua user:
 *   readItems('weight_logs', {})
 */
export const directus = createDirectus<DirectusSchema>(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_ADMIN_TOKEN))
  .with(rest());
