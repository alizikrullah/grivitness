/**
 * Error terstruktur yang bisa diterjemahkan langsung jadi response error
 * sesuai format CLAUDE.md section 10.
 *
 * Semua error yang disengaja di service layer WAJIB dilempar sebagai AppError.
 * Error lain apapun ditangkap error.middleware dan jadi INTERNAL_ERROR 500, detailnya
 * tidak pernah dibocorkan ke client.
 */

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DUPLICATE_ENTRY',
  'EMAIL_ALREADY_EXISTS',
  'INVALID_CREDENTIALS',
  'INVALID_REFRESH_TOKEN',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  /** Detail tambahan, misal daftar field yang gagal validasi. */
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;

    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Sesi tidak valid atau sudah berakhir'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Kamu tidak punya akses ke data ini'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Data tidak ditemukan'): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static duplicate(message: string): AppError {
    return new AppError(409, 'DUPLICATE_ENTRY', message);
  }

  static emailTaken(): AppError {
    return new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email ini sudah terdaftar');
  }

  /**
   * Sengaja bernada sama dengan kegagalan password supaya penyerang tidak bisa
   * menebak email mana yang terdaftar lewat perbedaan pesan error.
   */
  static invalidCredentials(): AppError {
    return new AppError(401, 'INVALID_CREDENTIALS', 'Email atau password salah');
  }

  static invalidRefreshToken(): AppError {
    return new AppError(
      401,
      'INVALID_REFRESH_TOKEN',
      'Refresh token tidak valid atau sudah dipakai',
    );
  }

  static upstream(message = 'Layanan eksternal sedang bermasalah'): AppError {
    return new AppError(502, 'UPSTREAM_ERROR', message);
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;
