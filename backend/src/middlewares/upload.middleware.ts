import multer from 'multer';

import { AppError } from '../utils/api-error.js';
import { MAX_UPLOAD_BYTES } from '../utils/sharp.js';

/**
 * Multer dikonfigurasi memoryStorage, BUKAN diskStorage.
 *
 * File tidak pernah menyentuh disk server: dari memory langsung dikonversi
 * Sharp lalu diunggah ke Directus storage. Selain lebih cepat, ini menghindari
 * file yatim menumpuk di server ketika ada request yang gagal di tengah jalan.
 */
const storage = multer.memoryStorage();

/** Hanya tipe gambar yang masuk akal difoto dari HP. */
const TIPE_DIIZINKAN = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    // Tidak ada endpoint yang menerima lebih dari dua file sekaligus.
    files: 2,
  },
  fileFilter: (_req, file, callback) => {
    if (!TIPE_DIIZINKAN.has(file.mimetype.toLowerCase())) {
      callback(
        AppError.badRequest(
          `Tipe file ${file.mimetype} tidak didukung. Gunakan JPG, PNG, HEIC, atau WebP.`,
        ),
      );
      return;
    }

    callback(null, true);
  },
});

/**
 * Menerjemahkan error Multer jadi AppError.
 *
 * Tanpa ini, file yang melebihi batas ukuran menghasilkan 500 dengan pesan
 * teknis "LIMIT_FILE_SIZE" yang tidak berarti apa-apa bagi user.
 */
export const translateUploadError = (error: unknown): AppError | null => {
  if (!(error instanceof multer.MulterError)) return null;

  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return AppError.badRequest(
        `Ukuran file melebihi batas ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`,
      );
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return AppError.badRequest(`File "${error.field ?? 'tidak dikenal'}" tidak diharapkan`);
    default:
      return AppError.badRequest(`Upload gagal: ${error.message}`);
  }
};
