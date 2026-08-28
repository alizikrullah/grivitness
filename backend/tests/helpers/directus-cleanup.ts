import { deleteItem, deleteUser, readItems } from '@directus/sdk';

import { directus } from '../../src/config/directus.js';

/**
 * Test integrasi menembak instance Directus yang sesungguhnya, bukan tiruan.
 * Lebih lambat, tapi yang diuji jadi perilaku nyata: unique constraint sungguhan,
 * cascade delete sungguhan, dan bentuk error sungguhan dari Directus.
 *
 * Konsekuensinya data uji harus dibersihkan sendiri. Semua email uji memakai
 * awalan yang sama supaya bisa disapu bersih tanpa menyentuh data lain.
 */

export const TEST_EMAIL_PREFIX = '__vitest__';

/**
 * Email unik per pemanggilan, supaya test yang jalan berurutan tidak saling bentrok.
 *
 * Sengaja sudah huruf kecil semua: layer validasi menormalkan email sebelum
 * disimpan, jadi kalau helper ini menghasilkan huruf besar, nilai yang tersimpan
 * akan berbeda dari yang dikembalikan di sini dan bikin perbandingan di test meleset.
 */
export const testEmail = (label: string): string =>
  `${TEST_EMAIL_PREFIX}.${label}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`.toLowerCase();

/**
 * Menghapus seluruh user uji beserta data turunannya.
 *
 * Baris di streaks, notification_settings, dan refresh_tokens ikut terhapus
 * lewat ON DELETE CASCADE, jadi tidak perlu dihapus satu per satu.
 */
export const cleanupTestUsers = async (): Promise<number> => {
  const users = await directus.request(
    readItems('users', {
      filter: { email: { _starts_with: TEST_EMAIL_PREFIX } },
      limit: -1,
      fields: ['id', 'directus_user_id'],
    }),
  );

  for (const user of users) {
    if (user.directus_user_id) {
      try {
        await directus.request(deleteUser(user.directus_user_id));
      } catch {
        // Cerminan di directus_users memang bisa tidak ada, pembuatannya
        // sengaja tidak fatal saat register.
      }
    }

    await directus.request(deleteItem('users', user.id));
  }

  return users.length;
};
