import sharp from 'sharp';

import { AppError } from './api-error.js';

/**
 * Konversi gambar ke WebP sesuai CLAUDE.md section 5.
 *
 * Kualitas 100 dipakai supaya tidak ada detail yang hilang — foto badan dan
 * makanan dianalisa AI, dan artefak kompresi bisa mengubah hasil analisanya.
 */

/** Batas ukuran file masuk, sebelum konversi. */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Sisi terpanjang dibatasi supaya foto 12 megapiksel dari kamera HP tidak
 * dikirim utuh ke Groq. Batas request Groq 20MB, dan gambar sebesar itu juga
 * tidak menambah akurasi analisa — cuma memperlambat dan memperbesar biaya.
 */
const MAX_DIMENSI_PX = 2048;

export interface ConvertedImage {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
}

export const convertToWebP = async (input: Buffer): Promise<ConvertedImage> => {
  try {
    const pipeline = sharp(input)
      // Foto dari HP menyimpan orientasi di metadata EXIF, bukan di pikselnya.
      // Tanpa rotate(), foto potret bisa berubah jadi lanskap setelah konversi.
      .rotate()
      .resize({
        width: MAX_DIMENSI_PX,
        height: MAX_DIMENSI_PX,
        fit: 'inside',
        // Gambar yang sudah lebih kecil dari batas dibiarkan apa adanya.
        withoutEnlargement: true,
      })
      .webp({ quality: 100 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      bytes: data.byteLength,
    };
  } catch (error) {
    // Sharp melempar untuk file yang bukan gambar atau yang datanya rusak.
    // Itu kesalahan input dari user, bukan bug server, jadi dibalas 400.
    throw AppError.badRequest(
      'File tidak bisa dibaca sebagai gambar. Pastikan formatnya JPG, PNG, HEIC, atau WebP.',
      error instanceof Error ? { reason: error.message } : undefined,
    );
  }
};
