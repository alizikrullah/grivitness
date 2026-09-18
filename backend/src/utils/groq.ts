import axios, { type AxiosError } from 'axios';

import { env, GROQ_MODEL_BAWAAN } from '../config/env.js';
import { AppError } from './api-error.js';
import { logger } from './logger.js';

/**
 * Klien Groq Vision sesuai CLAUDE.md section 7.
 *
 * Batas yang ditetapkan Groq untuk model vision ini: maksimal 3 gambar dan
 * 20MB per request. Dulu tertulis 5, dan permintaan empat gambar ditolak
 * dengan "This model supports up to 3 images".
 * Keduanya diperiksa di sini supaya kegagalannya muncul sebagai pesan yang
 * jelas, bukan sebagai error mentah dari API di tengah proses upload.
 */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const MAKS_GAMBAR = 3;
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

  return mintaJson(
    {
      model: env.GROQ_VISION_MODEL,
      messages: [{ role: 'user', content }],
      ...TANPA_NALAR,
    },
    GROQ_MODEL_BAWAAN.vision,
  );
};

/**
 * Analisa dari TEKS saja, tanpa gambar, dengan format JSON yang sama.
 *
 * Dipakai saat user mencatat makanan tanpa foto. Modelnya model CHAT, bukan
 * vision, dan itu disengaja: Groq menghitung batas laju per model, jadi jalur
 * teks punya jatah token sendiri dan tidak berebut dengan analisa foto yang
 * jauh lebih boros. Tidak ada gambar yang harus dibaca, jadi model teks
 * memang cukup: yang diminta cuma pengetahuan gizi dan porsi umum.
 *
 * reasoning_effort tidak dikirim di sini. Nilai 'none' terbukti wajib untuk
 * model vision, tapi model chat sudah bekerja tanpa parameter itu di fitur
 * chat, dan nilai yang diterima tiap model berbeda.
 */
export const analyzeText = async (prompt: string): Promise<Record<string, unknown>> =>
  mintaJson(
    {
      model: env.GROQ_CHAT_MODEL,
      messages: [{ role: 'user', content: prompt }],
    },
    GROQ_MODEL_BAWAAN.chat,
  );

/**
 * Inti permintaan JSON ke Groq: kirim, paksa JSON, dan tiga jenis percobaan
 * ulang yang masing-masing menangani satu kegagalan khas.
 *
 * `modelBawaan` dipakai kalau model yang disebut env sudah tidak ada di Groq.
 * Lihat GROQ_MODEL_BAWAAN di config/env.ts untuk alasannya.
 */
const mintaJson = async (
  payload: Record<string, unknown>,
  modelBawaan: string,
): Promise<Record<string, unknown>> => {
  if (env.GROQ_API_KEY === '') {
    throw AppError.upstream('GROQ_API_KEY belum diisi di environment');
  }

  let model = payload.model as string;

  const kirim = async (jsonKetat: boolean): Promise<string> => {
    const { data } = await axios.post<GroqResponse>(
      ENDPOINT,
      {
        ...payload,
        model,
        // Tanpa ini model bisa membalas prosa yang tidak bisa di-parse.
        ...(jsonKetat ? { response_format: { type: 'json_object' } } : {}),
        temperature: 0.2,
        max_tokens: MAKS_TOKEN_ANALISA,
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
      Nama model yang disebut env sudah mati di Groq. Ini terjadi tanpa masa
      transisi (qwen/qwen3.6-27b lenyap begitu saja), dan env di server tidak
      ikut berubah bersama kode. Dicoba sekali dengan nama bawaan yang masih
      hidup, dengan peringatan keras di log supaya env-nya segera dibetulkan.
    */
    if (modelTidakAda(error) && model !== modelBawaan) {
      logger.error(
        { model, modelBawaan },
        'Model Groq di env sudah tidak ada. Memakai model bawaan. PERBAIKI env di server.',
      );
      model = modelBawaan;

      try {
        return parseJsonResponse(await kirim(true));
      } catch (ulang) {
        if (ulang instanceof AppError) throw ulang;
        throw translateAxiosError(ulang);
      }
    }

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

/** Groq membalas 404 dengan pesan bahwa modelnya tidak ada atau tidak bisa diakses. */
const modelTidakAda = (error: unknown): boolean => {
  if (!axios.isAxiosError(error) || error.response?.status !== 404) return false;

  return /does not exist|do not have access/i.test(JSON.stringify(error.response.data ?? ''));
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
 * Satu makanan seperti yang ditulis user, bahan untuk menyusun prompt.
 * Bentuknya sama dengan FoodItemDto di food.validation.ts.
 */
export interface FoodPromptItem {
  name: string;
  portions: number;
  weight?: number;
  unit: 'g' | 'ml';
}

/**
 * Prompt analisa makanan. Tugas model SEMPIT, dan itu intinya.
 *
 * Nama makanan dan jumlah porsi datang dari user dan TIDAK boleh ditebak
 * model. Yang tersisa untuk model cuma dua taksiran:
 *   1. berat SATU porsi, HANYA untuk item yang user kosongkan beratnya
 *   2. nilai gizi per 100 g atau per 100 ml, sesuai satuan item
 *
 * Perkalian jumlah × berat × gizi dikerjakan backend, bukan model. Ini
 * warisan pelajaran fitur chat: model menaksir, backend menghitung.
 *
 * Sejarahnya: prompt lama mengirim foto plus catatan bebas dan meminta model
 * "menuruti" catatan itu untuk jumlah porsi. Model tidak nurut. "2 pcs"
 * dihitung satu, terlihat dari beratnya. Prompt sudah menyuruh dan gagal,
 * jadi jaminannya dipindahkan ke kode: jumlah porsi sekarang kolom angka
 * yang dikalikan backend, dan tidak ada lagi yang bisa diabaikan model.
 *
 * Nama diberi nomor dan dijawab per nomor, supaya jawaban bisa dicocokkan ke
 * item user tanpa mengandalkan model mengeja ulang namanya sama persis.
 */
export const foodPrompt = (items: FoodPromptItem[], denganFoto: boolean): string => {
  const daftar = items
    .map((item, i) => {
      const porsi = item.portions === 1 ? '1 portion' : `${item.portions} portions`;
      const berat =
        item.weight === undefined
          ? 'weight per portion: UNKNOWN, estimate it'
          : `weight per portion: ${item.weight} ${item.unit} (given by user, do not change)`;
      return `${i + 1}. ${item.name}, ${porsi}, unit ${item.unit}, ${berat}`;
    })
    .join('\n');

  const sumber = denganFoto
    ? `A photo of the meal is attached. Use it ONLY to estimate weight per portion for items marked UNKNOWN, using plate size, cutlery, and bowls as scale references. Do not use it to rename items or change portion counts: the list below is authoritative and was written by the person who ate it.`
    : `There is no photo. For items marked UNKNOWN, estimate a typical single-portion weight as served in Indonesia.`;

  const cocok = denganFoto
    ? `,
  "photo_matches": boolean,
  "photo_note": "string"`
    : '';

  const aturanFoto = denganFoto
    ? `
- photo_matches: false only if the photo clearly shows different food from the list (for example the list says nasi goreng but the photo is clearly soto). Minor differences, missing side dishes, or unclear photos count as true. photo_note: one short Indonesian sentence explaining a false, empty string when true.`
    : '';

  return `The user ate these items. Numbers and names come from the user and are FINAL.

${daftar}

${sumber}

For EACH numbered item return, in the same order:
- grams_per_portion: the weight of ONE portion in the item's unit (grams, or ml for drinks). For items with a given weight, copy the given number.
- kcal_per_100, protein_per_100, carbs_per_100, fat_per_100: nutrition per 100 g (or per 100 ml when the unit is ml) of the food AS EATEN, from standard food composition tables. Fried food must include absorbed oil; cooked rice is not dry rice.

Return ONLY a JSON object with this exact structure:
{
  "items": [
    {
      "index": number,
      "grams_per_portion": number,
      "kcal_per_100": number,
      "protein_per_100": number,
      "carbs_per_100": number,
      "fat_per_100": number
    }
  ],
  "confidence": "low" | "medium" | "high"${cocok}
}

Rules:
- Return exactly one entry per numbered item, with the matching index.
- Do NOT multiply by the portion count and do NOT return totals. The application computes every total.
- Never rename, merge, split, add, or drop items.${aturanFoto}`;
};

/**
 * Prompt analisa foto badan satu tanggal.
 *
 * Tidak ada lagi estimated_body_fat_percent. Itu tebakan visual yang tampil
 * seperti angka resmi, tidak dipakai hitungan mana pun, dan bisa loncat
 * beberapa persen cuma karena pencahayaan atau pose. Yang tersisa kesan
 * berupa kalimat, dan pengukuran yang sesungguhnya datang dari pita di
 * pinggang, bukan dari model.
 */
export const BODY_PROMPT = `Analyze the body in these two images (front and side view). Return ONLY a JSON object with this exact structure:
{
  "posture_notes": "string",
  "visible_changes": "string",
  "recommendations": ["string"]
}
Write everything in Indonesian, addressed to the person in the photo as "kamu". Do NOT estimate body fat percentage, weight, or any number. Describe what is visible, not what you infer.`;

/**
 * Prompt membandingkan foto badan DUA tanggal: dua gambar gabungan, masing-
 * masing "sebelum | sesudah" untuk tampak depan dan tampak samping. Digabung
 * karena model vision Groq membatasi tiga gambar per permintaan.
 *
 * Yang diminta PENDAPAT, bukan pengukuran. Model lebih andal menilai "mana
 * yang lebih ramping" daripada "berapa persen", tapi untuk selisih 1-3 kg
 * dalam sebulan bedanya halus dan gampang kalah oleh pencahayaan, jarak
 * kamera, pose, dan perut yang kembung. Karena itu hasilnya disimpan sebagai
 * kalimat dan label arah, tidak pernah sebagai angka, dan user diminta menilai
 * fotonya sendiri dengan pendapat ini sebagai suara kedua.
 *
 * Lingkar pinggang SENGAJA tidak dikirim ke model. Kalau dikirim, model
 * tinggal mengulang angkanya, dan pendapat visualnya berhenti jadi suara
 * kedua yang berdiri sendiri.
 */
export const bodyComparePrompt = (
  fromDate: string,
  toDate: string,
): string => `You are shown two side-by-side comparison images of the same person. In each image, the LEFT half is from ${fromDate} and the RIGHT half is from ${toDate} (later date). Image 1 is the front view, image 2 is the side view.

Compare the RIGHT (later) halves against the LEFT (earlier) halves. Judge only what is visible: waistline, belly, face, arms, overall silhouette, posture. Be honest about limits: different lighting, distance, pose, clothing, or time of day can fake or hide changes, and you must say so when it applies.

Return ONLY a JSON object with this exact structure:
{
  "direction": "leaner" | "same" | "fuller" | "unclear",
  "opinion": "string"
}

Rules:
- direction: "leaner" if the later photos look visibly slimmer, "fuller" if visibly bigger, "same" if no visible change, "unclear" if the photos are not comparable (different framing, lighting, pose, clothing).
- opinion: 2 to 4 sentences in Indonesian, addressed as "kamu". Say what changed and where, and name the biggest reason the comparison could be misleading. Do NOT estimate body fat, weight, or any number. This is an impression, not a measurement, and must read like one.`;

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
