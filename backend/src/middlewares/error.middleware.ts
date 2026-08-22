import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { AppError, isAppError } from '../utils/api-error.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';

/**
 * Error handler global. Dipasang PALING AKHIR di app.ts, setelah semua route.
 *
 * Express 5 otomatis meneruskan error dari handler async ke sini, jadi controller
 * tidak perlu dibungkus try/catch atau asyncHandler.
 */

/** Struktur error yang dilempar SDK Directus. */
interface DirectusError {
  errors: Array<{
    message?: string;
    extensions?: {
      code?: string;
      field?: string;
      collection?: string;
    };
  }>;
}

const isDirectusError = (error: unknown): error is DirectusError =>
  typeof error === 'object' &&
  error !== null &&
  'errors' in error &&
  Array.isArray((error as DirectusError).errors);

/** Pesan Indonesia untuk field yang kena unique constraint. */
const DUPLICATE_MESSAGES: Record<string, string> = {
  email: 'Email ini sudah terdaftar',
  user_date_key: 'Data untuk tanggal ini sudah pernah diinput',
  directus_user_id: 'User ini sudah tersinkronisasi',
  token_hash: 'Token ini sudah pernah dipakai',
};

/**
 * Menerjemahkan error Directus jadi AppError.
 * Yang paling penting: RECORD_NOT_UNIQUE -> DUPLICATE_ENTRY, termasuk
 * pelanggaran user_date_key yang menjaga aturan satu log per hari per user.
 */
const translateDirectusError = (error: DirectusError): AppError | null => {
  const first = error.errors[0];
  if (!first) return null;

  const code = first.extensions?.code;
  const field = first.extensions?.field;

  switch (code) {
    case 'RECORD_NOT_UNIQUE': {
      const message =
        (field ? DUPLICATE_MESSAGES[field] : undefined) ?? 'Data ini sudah ada sebelumnya';
      return AppError.duplicate(message);
    }
    case 'FORBIDDEN':
      return AppError.forbidden();
    case 'INVALID_CREDENTIALS':
      return AppError.unauthorized();
    default:
      return null;
  }
};

export const errorMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  // Express mengenali sebuah fungsi sebagai error handler dari jumlah argumennya.
  // Parameter ini wajib ada walau tidak dipakai.
  _next: NextFunction,
): void => {
  // 1. Error yang memang sengaja dilempar service layer
  if (isAppError(error)) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, path: req.path }, error.message);
    }
    sendError(res, error.statusCode, error.code, error.message, error.details);
    return;
  }

  // 2. Validasi Zod yang lolos dari validate.middleware
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    sendError(res, 400, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid', details);
    return;
  }

  // 3. Error dari Directus yang punya padanan jelas
  if (isDirectusError(error)) {
    const translated = translateDirectusError(error);
    if (translated) {
      sendError(res, translated.statusCode, translated.code, translated.message);
      return;
    }

    logger.error({ err: error, path: req.path }, 'Directus membalas error tak terduga');
    sendError(res, 502, 'UPSTREAM_ERROR', 'Gagal menghubungi layanan data');
    return;
  }

  // 4. Sisanya: bug. Detailnya dicatat di log, TIDAK dikirim ke client.
  logger.error({ err: error, path: req.path, method: req.method }, 'Unhandled error');
  sendError(res, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan di server');
};

/** Dipasang setelah semua route, sebelum errorMiddleware. */
export const notFoundMiddleware = (req: Request, res: Response): void => {
  sendError(res, 404, 'NOT_FOUND', `Endpoint ${req.method} ${req.path} tidak ditemukan`);
};
