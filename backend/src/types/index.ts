import type { Request } from 'express';

import { AppError } from '../utils/api-error.js';

/** User yang sudah terverifikasi lewat auth.middleware. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Diisi auth.middleware. Sengaja optional karena route publik seperti
       * login dan register tidak melewati middleware itu.
       *
       * Jangan diakses langsung di controller, pakai getAuthUser(req) supaya
       * tidak perlu non-null assertion yang bisa meledak diam-diam.
       */
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Mengambil user dari request yang sudah melewati auth.middleware.
 *
 * Melempar UNAUTHORIZED kalau ternyata kosong. Kondisi itu seharusnya mustahil,
 * dan kalau sampai terjadi artinya ada route protected yang lupa dipasangi
 * authMiddleware, lebih baik ketahuan sebagai 401 daripada crash 500.
 */
export const getAuthUser = (req: Request): AuthenticatedUser => {
  if (!req.user) {
    throw AppError.unauthorized('Endpoint ini butuh autentikasi');
  }

  return req.user;
};
