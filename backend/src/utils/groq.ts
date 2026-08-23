import axios, { type AxiosError } from 'axios';

import { env } from '../config/env.js';
import { AppError } from './api-error.js';
import { logger } from './logger.js';

/**
 * Klien Groq Vision sesuai CLAUDE.md section 7.
 *
 * Batas yang ditetapkan Groq: maksimal 5 gambar dan 20MB per request.
 * Keduanya diperiksa di sini supaya kegagalannya muncul sebagai pesan yang
 * jelas, bukan sebagai error mentah dari API di tengah proses upload.
 */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const MAKS_GAMBAR = 5;
const MAKS_TOTAL_BYTES = 20 * 1024 * 1024;

/** Analisa AI bisa lambat, tapi tidak boleh menggantung request selamanya. */
const TIMEOUT_MS = 60_000;

interface GroqChoice {
  message?: { content?: string };
}

interface GroqResponse {
  choices?: GroqChoice[];
}

const toDataUri = (buffer: Buffer): string => `data:image/webp;base64,${buffer.toString('base64')}`;

/**
 * Mengirim satu atau beberapa gambar ke Groq dan mengembalikan JSON hasilnya.
 *
 * Sengaja mengembalikan objek mentah, bukan bentuk yang sudah dipetakan.
 * Service yang memanggil yang memutuskan bagian mana yang dipakai, dan
 * respons utuhnya tetap disimpan di kolom ai_analysis supaya tidak ada
 * informasi yang hilang.
 */
export const analyzeImages = async (
  images: Buffer[],
  prompt: string,
): Promise<Record<string, unknown>> => {
  if (env.GROQ_API_KEY === '') {
    throw AppError.upstream('GROQ_API_KEY belum diisi di environment');
  }

  if (images.length === 0) {
    throw AppError.badRequest('Tidak ada gambar untuk dianalisa');
  }

  if (images.length > MAKS_GAMBAR) {
    throw AppError.badRequest(`Maksimal ${MAKS_GAMBAR} gambar per analisa`);
  }

  const totalBytes = images.reduce((jumlah, gambar) => jumlah + gambar.byteLength, 0);
  if (totalBytes > MAKS_TOTAL_BYTES) {
    throw AppError.badRequest(
      `Total ukuran gambar ${Math.round(totalBytes / 1024 / 1024)}MB melebihi batas 20MB`,
    );
  }

  const content = [
    { type: 'text', text: prompt },
    ...images.map((gambar) => ({
      type: 'image_url',
      image_url: { url: toDataUri(gambar) },
    })),
  ];

  const kirim = async (): Promise<string> => {
    const { data } = await axios.post<GroqResponse>(
      ENDPOINT,
      {
        model: env.GROQ_VISION_MODEL,
        messages: [{ role: 'user', content }],
        // Tanpa ini model bisa membalas prosa yang tidak bisa di-parse.
        response_format: { type: 'json_object' },
        temperature: 0.2,
      },
      {
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: TIMEOUT_MS,
      },
    );

    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw AppError.upstream('Groq membalas tanpa isi');

    return raw;
  };

  try {
    return parseJsonResponse(await kirim());
  } catch (error) {
    if (error instanceof AppError) throw error;

    // Batas token per menit Groq gampang tersentuh: satu analisa foto badan
    // mengirim dua gambar sekaligus, dan free tier hanya memberi 8000 token
    // per menit. Groq menyebutkan sendiri berapa lama harus menunggu, jadi
    // sekali percobaan ulang menyelamatkan sebagian besar kasusnya.
    //
    // Diulang HANYA untuk 429. Status lain berarti permintaannya memang salah,
    // dan mengulanginya cuma membuang waktu user.
    const tunggu = jedaRateLimit(error);

    if (tunggu === null) throw translateAxiosError(error);

    logger.warn({ tunggu_ms: tunggu }, 'Groq membatasi laju, menunggu lalu mencoba sekali lagi');
    await new Promise((resolve) => setTimeout(resolve, tunggu));

    try {
      return parseJsonResponse(await kirim());
    } catch (ulang) {
      if (ulang instanceof AppError) throw ulang;
      throw translateAxiosError(ulang);
    }
  }
};

/** Batas atas menunggu. Lebih dari ini, user lebih baik disuruh mencoba lagi sendiri. */
const MAKS_TUNGGU_MS = 20_000;

/**
 * Lama menunggu yang disarankan Groq saat kena rate limit, dalam milidetik.
 * Mengembalikan null kalau error-nya bukan rate limit atau tunggunya kelewat lama.
 */
const jedaRateLimit = (error: unknown): number | null => {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return null;

  const retryAfter = error.response.headers['retry-after'] as string | undefined;
  const dariHeader = retryAfter ? Number(retryAfter) * 1000 : Number.NaN;

  // Header retry-after tidak selalu ada, tapi pesannya menyebutkan detiknya:
  // "Please try again in 16.245s"
  const pesan = JSON.stringify(error.response.data ?? '');
  const cocok = /try again in ([\d.]+)s/i.exec(pesan);
  const dariPesan = cocok?.[1] ? Number(cocok[1]) * 1000 : Number.NaN;

  const tunggu = Number.isFinite(dariHeader) ? dariHeader : dariPesan;

  if (!Number.isFinite(tunggu) || tunggu > MAKS_TUNGGU_MS) return null;

  // Ditambah sedikit supaya tidak menembak persis di batas jendelanya.
  return Math.ceil(tunggu) + 500;
};

/**
 * Model kadang membungkus JSON dalam blok kode markdown walaupun sudah diminta
 * membalas JSON murni. Pembungkusnya dilepas dulu sebelum di-parse.
 */
const parseJsonResponse = (raw: string): Record<string, unknown> => {
  const bersih = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    const parsed: unknown = JSON.parse(bersih);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('bukan objek JSON');
    }

    return parsed as Record<string, unknown>;
  } catch {
    logger.error({ raw: bersih.slice(0, 500) }, 'Respons Groq bukan JSON yang valid');
    throw AppError.upstream('Hasil analisa AI tidak bisa dibaca. Coba lagi.');
  }
};

const translateAxiosError = (error: unknown): AppError => {
  if (!axios.isAxiosError(error)) {
    logger.error({ err: error }, 'Kegagalan tak terduga saat memanggil Groq');
    return AppError.upstream('Gagal menganalisa gambar');
  }

  const axiosError = error as AxiosError;
  const status = axiosError.response?.status;

  logger.error(
    { status, data: axiosError.response?.data, code: axiosError.code },
    'Groq membalas error',
  );

  if (axiosError.code === 'ECONNABORTED') {
    return AppError.upstream('Analisa AI terlalu lama, coba lagi dengan foto yang lebih kecil');
  }

  if (status === 401 || status === 403) {
    return AppError.upstream('GROQ_API_KEY ditolak Groq');
  }

  if (status === 429) {
    return AppError.upstream('Kuota analisa AI sedang penuh, coba lagi sebentar lagi');
  }

  return AppError.upstream('Layanan analisa AI sedang bermasalah');
};

/** Bagian tetap dari prompt analisa makanan, sesuai CLAUDE.md section 7. */
const FOOD_BASE = `Analyze the food in this image. Return ONLY a JSON object with this exact structure:
{
  "foods_detected": ["string"],
  "total_calories": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "confidence": "low" | "medium" | "high"
}
Estimate for the portion visible in the photo. Use Indonesian food names when the dish is Indonesian.`;

/**
 * Prompt analisa makanan, ditambah catatan user sebagai konteks.
 *
 * Catatan user WAJIB ikut dikirim kalau ada. Model yang cuma melihat foto sering
 * keliru membedakan makanan yang mirip secara visual — lontong terbaca singkong,
 * tempe terbaca tahu. User yang memotret tahu persis isi piringnya, jadi
 * keterangannya diperlakukan sebagai kebenaran untuk MENENTUKAN makanannya,
 * sementara foto tetap dipakai untuk menaksir porsi.
 *
 * Sebelumnya prompt ini konstanta dan catatan user cuma disimpan ke database
 * tanpa pernah sampai ke AI. Hasilnya analisa yang mengabaikan keterangan yang
 * sudah susah payah diketik user.
 */
export const foodPrompt = (catatan?: string | null): string => {
  const bersih = catatan?.trim();
  if (!bersih) return FOOD_BASE;

  return `${FOOD_BASE}

The user describes this meal as: "${bersih}"

Treat that description as authoritative for WHAT the food is. Do not replace a dish the user named with a different one that merely looks similar in the photo. If the description names a component you cannot clearly see, still include it. Use the photo to judge portion size and to fill in anything the description leaves out.`;
};

/** Prompt analisa foto badan, sesuai CLAUDE.md section 7. */
export const BODY_PROMPT = `Analyze the body in these two images (front and side view). Return ONLY a JSON object with this exact structure:
{
  "posture_notes": "string",
  "visible_changes": "string",
  "estimated_body_fat_percent": number | null,
  "recommendations": ["string"]
}
Write posture_notes, visible_changes, and recommendations in Indonesian. Set estimated_body_fat_percent to null if you cannot estimate it with reasonable confidence.`;
