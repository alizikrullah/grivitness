import { deleteFile, uploadFiles } from '@directus/sdk';

import { directus } from '../config/directus.js';

import { fileUrl } from '../modules/files/files.service.js';
import { AppError } from './api-error.js';
import { logger } from './logger.js';

/**
 * Upload dan hapus file di Directus storage.
 *
 * Alur uploadnya sesuai CLAUDE.md section 5: buffer dari Multer sudah
 * dikonversi Sharp ke WebP sebelum sampai ke sini. Fungsi ini tidak pernah
 * menyentuh disk server.
 */

export interface UploadedFile {
  id: string;
  url: string;
}

export const uploadWebP = async (
  buffer: Buffer,
  filename: string,
  folderTitle?: string,
): Promise<UploadedFile> => {
  const form = new FormData();

  // Field non-file harus ditulis SEBELUM field file. Directus membaca metadata
  // dari field yang sudah lewat saat file-nya mulai diproses, jadi title yang
  // ditaruh belakangan akan diabaikan.
  if (folderTitle) form.append('title', folderTitle);

  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/webp' }), filename);

  const uploaded = await directus.request(uploadFiles(form));

  const id = (uploaded as { id?: string }).id;
  if (!id) {
    throw AppError.upstream('Directus tidak mengembalikan id file setelah upload');
  }

  return { id, url: fileUrl(id) };
};

/**
 * Menghapus file dari Directus storage.
 *
 * CLAUDE.md section 5 mewajibkan file dihapus dari Directus SEBELUM record-nya
 * dihapus dari database. Kalau urutannya dibalik dan penghapusan file gagal,
 * tidak ada lagi yang menyimpan id-nya — file itu jadi yatim selamanya tanpa
 * jejak.
 */
export const removeFile = async (fileId: string): Promise<void> => {
  await directus.request(deleteFile(fileId));
};

/**
 * Menghapus file tanpa pernah melempar error.
 *
 * Dipakai sebagai langkah pembatalan di unitOfWork. Saat rollback sedang
 * berjalan, sudah ada error lain yang sedang ditangani — kegagalan pembersihan
 * tidak boleh menutupi error aslinya. Cukup dicatat supaya bisa dibereskan
 * manual.
 */
export const removeFileSafely = async (fileId: string): Promise<void> => {
  try {
    await removeFile(fileId);
  } catch (error) {
    logger.error(
      { err: error, file_id: fileId },
      'Gagal menghapus file dari Directus, ada file yatim yang perlu dibersihkan manual',
    );
  }
};
