import { forUser } from '../../data/scoped.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/api-error.js';

/**
 * Penyajian file milik user.
 *
 * File di Directus storage bersifat PRIVAT — role publik tidak punya izin baca,
 * jadi URL /assets/{id} membalas 403 bagi siapa pun yang tidak memegang admin
 * token. Itu memang yang diinginkan: foto badan tidak boleh bisa dibuka siapa
 * saja yang kebetulan tahu URL-nya.
 *
 * Konsekuensinya client tidak bisa memuat gambar langsung dari Directus.
 * Backend yang menyajikannya, setelah memastikan file itu memang milik user
 * yang sedang login.
 */

/** URL yang disimpan di database dan dikirim ke client. */
export const fileUrl = (fileId: string): string => `/api/files/${fileId}`;

/**
 * Memastikan file ini benar-benar dirujuk oleh salah satu catatan milik user.
 *
 * Tanpa pemeriksaan ini, siapa pun yang punya akun bisa membuka file user lain
 * hanya dengan menebak id — dan endpoint ini akan dengan patuh menyajikannya
 * memakai admin token.
 */
const assertFileOwned = async (userId: string, fileId: string): Promise<void> => {
  const repo = forUser(userId);

  const [food, body] = await Promise.all([
    repo.count('food_logs', { directus_file_id: { _eq: fileId } }),
    repo.count('body_photos', {
      _or: [
        { front_directus_file_id: { _eq: fileId } },
        { side_directus_file_id: { _eq: fileId } },
      ],
    }),
  ]);

  if (food + body === 0) {
    // NOT_FOUND, bukan FORBIDDEN — membalas "tidak boleh" justru memberi tahu
    // bahwa file itu ada dan milik orang lain.
    throw AppError.notFound('File tidak ditemukan');
  }
};

export interface FileStream {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: string | null;
}

export const streamFile = async (userId: string, fileId: string): Promise<FileStream> => {
  await assertFileOwned(userId, fileId);

  const response = await fetch(`${env.DIRECTUS_URL}/assets/${fileId}`, {
    headers: { Authorization: `Bearer ${env.DIRECTUS_ADMIN_TOKEN}` },
  });

  if (!response.ok || !response.body) {
    if (response.status === 404) {
      throw AppError.notFound('File tidak ada di storage');
    }
    throw AppError.upstream('Gagal mengambil file dari storage');
  }

  return {
    body: response.body,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    contentLength: response.headers.get('content-length'),
  };
};
