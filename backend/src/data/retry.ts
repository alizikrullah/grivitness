import { logger } from '../utils/logger.js';

/**
 * Directus diakses lewat HTTPS melalui Cloudflare Tunnel, jadi kegagalan sesaat
 * itu wajar: koneksi putus, Directus sedang restart setelah deploy, gateway
 * timeout. Tanpa retry, gangguan satu detik langsung jadi error yang dilihat user.
 *
 * HANYA UNTUK OPERASI BACA.
 *
 * Penulisan sengaja tidak pernah di-retry. Kalau sebuah createItem gagal karena
 * koneksi putus, tidak ada cara mengetahui apakah Directus sempat memprosesnya
 * atau tidak. Mengulanginya bisa menghasilkan dua baris yang sama. Lebih baik
 * penulisan gagal terang-terangan dan user yang memutuskan untuk mengulang.
 */

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 150;

/** Status HTTP yang menandakan gangguan sementara, bukan kesalahan permintaan. */
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryable = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;

  // Kegagalan di lapisan jaringan: fetch tidak pernah sampai ke Directus.
  if (error instanceof TypeError && error.message.includes('fetch')) return true;

  const withResponse = error as { response?: { status?: number }; errors?: unknown };
  const status = withResponse.response?.status;
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);

  // RequestError dari SDK tanpa status berarti koneksi gagal sebelum ada respons.
  const withCode = error as { code?: string; cause?: { code?: string } };
  const code = withCode.code ?? withCode.cause?.code;

  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_SOCKET'
  );
};

export const withRetry = async <T>(operation: () => Promise<T>, label: string): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }

      // Backoff eksponensial: 150ms, lalu 300ms.
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);

      logger.warn(
        { label, attempt, max: MAX_ATTEMPTS, delay_ms: delay },
        'Directus gagal sementara, mencoba lagi',
      );

      await sleep(delay);
    }
  }

  throw lastError;
};
