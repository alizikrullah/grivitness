import type { Response } from 'express';

import type { ErrorCode } from './api-error.js';

/**
 * Helper response supaya format di CLAUDE.md section 10 konsisten di semua module.
 * Jangan pernah panggil res.json() langsung dari controller.
 */

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
}

export const sendSuccess = <T>(res: Response, data: T, statusCode = 200): void => {
  res.status(statusCode).json({ success: true, data });
};

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  statusCode = 200,
): void => {
  res.status(statusCode).json({ success: true, data, meta });
};

export const sendError = (
  res: Response,
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): void => {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
};
