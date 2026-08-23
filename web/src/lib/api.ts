import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import type { ApiErrorBody, ApiSuccess, AuthResult } from '@/types';
import { clearTokens, readTokens, saveTokens } from './token';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Analisa foto oleh Groq bisa memakan waktu; batas bawaan axios terlalu pendek. */
const TIMEOUT_MS = 90_000;

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Error yang sudah diterjemahkan dari amplop error backend.
 *
 * Backend selalu membalas { success: false, error: { code, message } } dengan
 * pesan berbahasa Indonesia yang layak ditampilkan. Yang perlu dijaga adalah
 * kasus di luar itu — jaringan mati, server tak terjangkau — yang tidak punya
 * amplop sama sekali dan kalau dibiarkan akan muncul sebagai "Network Error".
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;

  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;

    if (body?.error?.message) {
      return new ApiError(body.error.message, body.error.code, error.response?.status ?? 500);
    }

    if (error.code === 'ECONNABORTED') {
      return new ApiError('Permintaan terlalu lama. Coba lagi.', 'TIMEOUT', 408);
    }

    if (!error.response) {
      return new ApiError(
        'Tidak bisa terhubung ke server. Periksa koneksi internet kamu.',
        'NETWORK_ERROR',
        0,
      );
    }

    return new ApiError('Terjadi kesalahan di server.', 'INTERNAL_ERROR', error.response.status);
  }

  return new ApiError('Terjadi kesalahan tak terduga.', 'UNKNOWN', 500);
};

/**
 * Cara aplikasi memberi tahu lapisan atas bahwa sesi sudah tidak bisa
 * diselamatkan. Diisi auth store saat aplikasi start, supaya lapisan HTTP tidak
 * perlu mengimpor store dan menimbulkan impor melingkar.
 */
let onSessionExpired: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: (() => void) | null): void => {
  onSessionExpired = handler;
};

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) config.headers.Authorization = 'Bearer ' + accessToken;
  return config;
});

/**
 * Satu-satunya proses refresh yang boleh berjalan.
 *
 * Ini bukan sekadar optimasi. Backend merotasi refresh token setiap kali
 * dipakai dan menganggap pemakaian token lama sebagai indikasi pencurian —
 * seluruh sesi user langsung dicabut. Kalau tiga request kedaluwarsa bersamaan
 * lalu masing-masing menukar refresh token yang sama, dua di antaranya memakai
 * token yang sudah dirotasi dan user akan tertendang keluar.
 *
 * Di browser risikonya lebih besar daripada di mobile: satu halaman bisa punya
 * banyak komponen yang mengambil data sekaligus saat dibuka.
 */
let refreshInFlight: Promise<string> | null = null;

const performRefresh = async (): Promise<string> => {
  const tokens = readTokens();
  if (!tokens) throw new ApiError('Sesi berakhir', 'UNAUTHORIZED', 401);

  // Memakai axios polos, bukan instance `api`. Kalau memakai `api`, kegagalan
  // refresh akan memicu interceptor ini lagi dan berujung rekursi tak berujung.
  const { data } = await axios.post<ApiSuccess<AuthResult>>(
    BASE_URL + '/api/auth/refresh',
    { refresh_token: tokens.refresh },
    { timeout: 20_000, headers: { 'Content-Type': 'application/json' } },
  );

  saveTokens({ access: data.data.access_token, refresh: data.data.refresh_token });
  setAccessToken(data.data.access_token);

  return data.data.access_token;
};

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    const bisaDiperbarui =
      error.response?.status === 401 &&
      config !== undefined &&
      config._retried !== true &&
      // Kegagalan pada endpoint auth berarti kredensial atau refresh token yang
      // salah. Mengulanginya dengan token baru tidak akan menolong.
      config.url?.includes('/api/auth/') !== true;

    if (!bisaDiperbarui) return Promise.reject(toApiError(error));

    config._retried = true;

    try {
      refreshInFlight = refreshInFlight ?? performRefresh();
      const tokenBaru = await refreshInFlight;

      config.headers.Authorization = 'Bearer ' + tokenBaru;
      return await api.request(config);
    } catch {
      clearTokens();
      setAccessToken(null);
      onSessionExpired?.();
      return Promise.reject(
        new ApiError('Sesi kamu berakhir. Masuk lagi ya.', 'UNAUTHORIZED', 401),
      );
    } finally {
      refreshInFlight = null;
    }
  },
);

/** Membuka amplop { success, data } supaya pemanggil langsung menerima isinya. */
export const unwrap = async <T>(promise: Promise<{ data: ApiSuccess<T> }>): Promise<T> => {
  const response = await promise;
  return response.data.data;
};

export const get = <T>(url: string, config?: AxiosRequestConfig): Promise<T> =>
  unwrap<T>(api.get(url, config));

export const post = <T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> =>
  unwrap<T>(api.post(url, body, config));

export const patch = <T>(url: string, body?: unknown): Promise<T> =>
  unwrap<T>(api.patch(url, body));

export const del = async (url: string): Promise<void> => {
  await api.delete(url);
};

export const fileUrl = (path: string): string => (path.startsWith('http') ? path : BASE_URL + path);

/**
 * Mengambil foto sebagai object URL yang bisa dipasang ke <img src>.
 *
 * Ini masalah khas web yang tidak ada di mobile. Berkas di Directus bersifat
 * privat, jadi backend menyajikannya lewat proxy ber-autentikasi di
 * /api/files/:id — setiap permintaan gambar WAJIB membawa header Authorization.
 *
 * Tag <img> tidak bisa membawa header apa pun. Jadi gambarnya diambil lewat
 * fetch, dijadikan blob, lalu ditukar jadi object URL. Pemanggil WAJIB
 * memanggil URL.revokeObjectURL saat selesai — kalau tidak, setiap foto yang
 * pernah dibuka akan menetap di memori sampai tab ditutup.
 *
 * Menaruh token di query string sempat dipertimbangkan dan ditolak: token akan
 * bocor ke riwayat browser, log server, dan header Referer.
 */
export const fetchImageObjectUrl = async (path: string): Promise<string> => {
  const res = await fetch(fileUrl(path), {
    headers: accessToken ? { Authorization: 'Bearer ' + accessToken } : undefined,
  });

  if (!res.ok) throw new ApiError('Gagal memuat gambar', 'IMAGE_ERROR', res.status);

  return URL.createObjectURL(await res.blob());
};
