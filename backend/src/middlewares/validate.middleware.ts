import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

import { AppError } from '../utils/api-error.js';

/**
 * Middleware validasi request memakai Zod.
 *
 * Hasil parse MENGGANTIKAN nilai aslinya, jadi controller selalu menerima data
 * yang sudah bertipe benar, string "82.5" dari form sudah jadi number 82.5,
 * dan field yang tidak dikenal sudah dibuang.
 */

const formatIssues = (error: unknown): { field: string; message: string }[] => {
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    const { issues } = error as { issues: { path: PropertyKey[]; message: string }[] };
    return issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
  }

  return [{ field: '(root)', message: 'Format data tidak valid' }];
};

export const validateBody = (schema: ZodType): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(AppError.badRequest('Data yang dikirim tidak valid', formatIssues(result.error)));
      return;
    }

    req.body = result.data;
    next();
  };
};

/**
 * Di Express 5 `req.query` hanya bisa dibaca, tidak bisa ditimpa seperti req.body.
 * Karena itu hasil parse disimpan di `res.locals.query`, controller mengambilnya
 * dari sana lewat helper getValidatedQuery().
 */
export const validateQuery = (schema: ZodType): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      next(AppError.badRequest('Parameter query tidak valid', formatIssues(result.error)));
      return;
    }

    res.locals.query = result.data;
    next();
  };
};

export const validateParams = (schema: ZodType): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      next(AppError.badRequest('Parameter URL tidak valid', formatIssues(result.error)));
      return;
    }

    res.locals.params = result.data;
    next();
  };
};

/** Mengambil hasil validateQuery. Panggil dengan tipe skema yang sama. */
export const getValidatedQuery = <T>(res: Response): T => res.locals.query as T;

/** Mengambil hasil validateParams. */
export const getValidatedParams = <T>(res: Response): T => res.locals.params as T;
