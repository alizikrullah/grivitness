import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../utils/api-error.js';
import { verifyAccessToken } from '../utils/jwt.js';

/**
 * Memverifikasi access token dari header Authorization, lalu menempelkan
 * hasilnya ke req.user.
 *
 * Sengaja TIDAK query ke Directus untuk mengambil data user lengkap. Yang
 * dibutuhkan mayoritas endpoint cuma user id, dan itu sudah ada di dalam token.
 * Menghemat satu round-trip HTTP di setiap request. Service yang benar-benar
 * butuh data user lengkap bisa mengambilnya sendiri.
 */
export const authMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;

  if (!header) {
    next(AppError.unauthorized('Header Authorization tidak ada'));
    return;
  }

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    next(AppError.unauthorized('Format Authorization harus "Bearer <token>"'));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
};
