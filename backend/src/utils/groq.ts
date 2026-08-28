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

/**
 * Penalaran model DIMATIKAN untuk analisa gambar, dan ini bukan penghematan
 * biasa: tanpa itu fiturnya memang rusak.
 *
 * Model vision yang dipakai adalah model penalaran. Dibiarkan bernalar, ia
 * menghabiskan seluruh jatah keluarannya di dalam blok <think> dan JSON-nya
 * tidak pernah sempat ditulis. Yang sampai ke user lalu berupa 400
 * json_validate_failed dengan failed_generation kosong, diterjemahkan jadi
 * "Layanan analisa AI sedang bermasalah", pesan yang sama sekali tidak
 * menunjukkan sebabnya.
 *
 * Diukur pada permintaan yang sama: keluarannya turun dari ribuan token yang
 * terpotong di tengah kalimat menjadi 212 token JSON yang utuh. Itu sekaligus
 * meredam batas token per menit Groq, karena satu analisa jadi jauh lebih
 * murah.
 *
 * Yang diminta di sini ekstraksi, bukan pertimbangan. Taksiran gram dan nilai
 * gizi per 100 gram datang dari pengetahuan di dalam bobot model, dan itu tidak
 * bertambah baik karena ia menimbang-nimbang lebih lama.
 */
const TANPA_NALAR = { reasoning_effort: 'none' } as const;

/**
 * Pagar terakhir kalau penalarannya entah bagaimana tetap hidup. Sepuluh bahan
 * beserta nilai gizinya muat jauh di bawah angka ini, jadi batas ini hanya
 * menyentuh keluaran yang memang sudah melantur.
 */
const MAKS_TOKEN_ANALISA = 1200;

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

  const kirim = async (jsonKetat: boolean): Promise<string> => {
    const { data } = await axios.post<GroqResponse>(
      ENDPOINT,
      {
        model: env.GROQ_VISION_MODEL,
        messages: [{ role: 'user', content }],
        // Tanpa ini model bisa membalas prosa yang tidak bisa di-parse.
        ...(jsonKetat ? { response_format: { type: 'json_object' } } : {}),
        temperature: 0.2,
        max_tokens: MAKS_TOKEN_ANALISA,
        ...TANPA_NALAR,
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
    return parseJsonResponse(await kirim(true));
  } catch (error) {
    if (error instanceof AppError) throw error;

    /*
      Mode JSON terpaksa punya satu kegagalan yang khas: Groq membalas 400
      json_validate_failed dengan failed_generation KOSONG. Artinya decoder
      berbatasnya tidak berhasil menghasilkan apa pun yang sah.

      Diulang sekali tanpa batasan itu, lalu JSON-nya dikorek dari prosanya.
      Model tetap membalas isi yang benar; yang gagal cuma cara memaksanya.
      Ini lebih baik daripada menyerah, karena di titik ini fotonya sudah
      terlanjur diunggah dan user sudah menunggu.
    */
    if (gagalValidasiJson(error)) {
      logger.warn('Mode JSON Groq gagal, mencoba ulang tanpa response_format');

      try {
        return parseJsonResponse(await kirim(false));
      } catch (ulang) {
        if (ulang instanceof AppError) throw ulang;
        throw translateAxiosError(ulang);
      }
    }

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
      return parseJsonResponse(await kirim(true));
    } catch (ulang) {
      if (ulang instanceof AppError) throw ulang;
      throw translateAxiosError(ulang);
    }
  }
};

/** Kegagalan khas decoder JSON berbatas Groq, bukan kesalahan permintaan kita. */
const gagalValidasiJson = (error: unknown): boolean => {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return false;

  return JSON.stringify(error.response.data ?? '').includes('json_validate_failed');
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
 * Melepas semua pembungkus sebelum JSON-nya di-parse.
 *
 * Tiga lapis, dan ketiganya pernah benar-benar terjadi: blok penalaran
 * `<think>` dari model penalaran, pagar kode markdown walaupun sudah diminta
 * JSON murni, dan kalimat pengantar yang mengapit objeknya.
 */
const parseJsonResponse = (raw: string): Record<string, unknown> => {
  const tanpaNalar = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');

  const bersih = tanpaNalar
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  // Kalau masih ada kalimat yang mengapit, objek terluarnya yang diambil.
  const mulai = bersih.indexOf('{');
  const akhir = bersih.lastIndexOf('}');
  const kandidat = mulai >= 0 && akhir > mulai ? bersih.slice(mulai, akhir + 1) : bersih;

  try {
    const parsed: unknown = JSON.parse(kandidat);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('bukan objek JSON');
    }

    return parsed as Record<string, unknown>;
  } catch {
    logger.error({ raw: kandidat.slice(0, 500) }, 'Respons Groq bukan JSON yang valid');
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

/**
 * Bagian tetap dari prompt analisa makanan.
 *
 * Model diminta menguraikan piringnya menjadi bahan beserta BERATNYA, lalu
 * menyebut nilai gizi per 100 gram. Yang mengalikan dan menjumlahkan adalah
 * backend, bukan model.
 *
 * Sebelumnya model diminta langsung menyebut total kalori satu piring. Tebakan
 * seperti itu tidak bisa diperiksa siapa pun: kalau hasilnya 700 kkal, tidak
 * ada cara tahu apakah yang meleset porsi nasinya atau anggapan soal minyaknya.
 * Diuraikan per bahan, kesalahannya kelihatan dan bisa dibetulkan user pada
 * bagian yang memang salah.
 *
 * Ini juga menutup satu sumber kesalahan lain: aritmetika model. Sekarang
 * angka yang dia sebut hanya taksiran (berapa gram, berapa kkal per 100 g),
 * dan taksiran itulah yang memang jadi keahliannya.
 */
const FOOD_BASE = `Analyze the food in this image using TWO separate steps.

STEP 1 - Break the meal into individual components. For each component, estimate its edible weight in grams AS SERVED in the photo. Use plate diameter, cutlery, bowls, and common Indonesian serving sizes as scale references.

STEP 2 - For each component, state its nutrition PER 100 GRAMS from standard food composition tables.

Return ONLY a JSON object with this exact structure:
{
  "items": [
    {
      "name": "string",
      "grams": number,
      "kcal_per_100g": number,
      "protein_per_100g": number,
      "carbs_per_100g": number,
      "fat_per_100g": number
    }
  ],
  "confidence": "low" | "medium" | "high"
}

Rules:
- Do NOT return totals and do NOT multiply anything. The application computes every total from grams and the per-100g values.
- Every per-100g value must describe the food as it appears in the photo. Fried food must reflect absorbed oil; cooked rice is not dry rice.
- List drinks as items too. Treat 1 ml as 1 gram unless the drink is oil or syrup based.
- Ignore anything not eaten: plates, cutlery, garnish that is only decoration.
- Use Indonesian food names when the dish is Indonesian.`;

/**
 * Prompt analisa makanan, ditambah catatan user sebagai konteks.
 *
 * Catatan user WAJIB ikut dikirim kalau ada. Model yang cuma melihat foto sering
 * keliru membedakan makanan yang mirip secara visual, lontong terbaca singkong,
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

Treat that description as authoritative for WHAT the food is. Do not replace a dish the user named with a different one that merely looks similar in the photo. If the description names a component you cannot clearly see, still include it as an item. Use the photo to estimate grams, and use the description to fill in anything the photo leaves ambiguous.

If the description states a portion explicitly, such as "nasi setengah porsi" or "ayam 2 potong", let it override your visual estimate of that item's grams.`;
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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Balasan dibatasi supaya jawabannya tetap ringkas dan biayanya bisa ditebak.
 * Aturan "maksimal sekitar 120 kata" di prompt adalah bujukan; batas ini
 * pagarnya.
 */
const MAKS_TOKEN_BALASAN = 700;

/**
 * Percakapan teks ke Groq, dipakai fitur chat.
 *
 * Model chat dan model vision sengaja terpisah di env: Groq menghitung batas
 * laju PER MODEL, jadi memakai model berbeda berarti keduanya punya jatah
 * sendiri dan analisa foto tidak lagi bersaing dengan percakapan.
 *
 * Tidak memakai response_format JSON seperti analyzeImages, karena yang
 * diinginkan di sini justru prosa untuk dibaca manusia.
 */
export const chatCompletion = async (messages: ChatMessage[]): Promise<string> => {
  if (env.GROQ_API_KEY === '') {
    throw AppError.upstream('GROQ_API_KEY belum diisi di environment');
  }

  const kirim = async (): Promise<string> => {
    const { data } = await axios.post<GroqResponse>(
      ENDPOINT,
      {
        model: env.GROQ_CHAT_MODEL,
        messages,
        // Cukup luwes untuk terdengar seperti orang, cukup rendah untuk tidak
        // mengarang. Analisa gambar memakai 0.2 karena di sana yang diminta
        // ekstraksi, bukan tulisan.
        temperature: 0.4,
        max_tokens: MAKS_TOKEN_BALASAN,
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

    return raw.trim();
  };

  try {
    return await kirim();
  } catch (error) {
    if (error instanceof AppError) throw error;

    const tunggu = jedaRateLimit(error);
    if (tunggu === null) throw translateAxiosError(error);

    logger.warn(
      { tunggu_ms: tunggu },
      'Groq membatasi laju chat, menunggu lalu mencoba sekali lagi',
    );
    await new Promise((resolve) => setTimeout(resolve, tunggu));

    try {
      return await kirim();
    } catch (ulang) {
      if (ulang instanceof AppError) throw ulang;
      throw translateAxiosError(ulang);
    }
  }
};
