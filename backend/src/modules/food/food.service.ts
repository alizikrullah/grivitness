import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { FoodLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { removeFile, removeFileSafely, uploadWebP } from '../../utils/directus-files.js';
import { analyzeImages, analyzeText, foodPrompt } from '../../utils/groq.js';
import {
  type FoodAnalysis,
  hitungItem,
  jumlahkan,
  kebutuhanModel,
  perluModel,
  susunAnalisa,
} from '../../utils/food-math.js';
import { convertToWebP, toAnalysisBuffer } from '../../utils/sharp.js';
import { timestampDayFilter } from '../../utils/query.js';
import { fileUrl } from '../files/files.service.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import { bacaIngatan, cocokkanIngatan, saranMakanan } from './food-memory.js';
import type { CreateFoodDto, FoodItemEditDto, UpdateFoodDto } from './food.validation.js';

/** Bentuk yang dikirim ke client: record ditambah URL foto yang dirangkai dari id berkasnya. */
export type FoodLog = FoodLogRecord & { photo_url: string | null };

const denganFoto = (log: FoodLogRecord): FoodLog => ({
  ...log,
  photo_url: log.directus_file_id ? fileUrl(log.directus_file_id) : null,
});

/**
 * Mencatat satu sesi makan.
 *
 * Fotonya opsional. Dengan foto: diunggah ke storage, salinan kecilnya dikirim
 * ke model vision untuk menaksir berat item yang beratnya dikosongkan user.
 * Tanpa foto: setiap item wajib punya berat, dan model teks cuma diminta nilai
 * gizinya.
 *
 * Ini operasi lintas sistem, jadi dibungkus unitOfWork: berkas yang sudah
 * terlanjur terunggah didaftarkan lewat onRollback supaya kegagalan di langkah
 * mana pun setelahnya tidak meninggalkan berkas yatim di storage.
 */
export const create = async (
  userId: string,
  photo: Buffer | null,
  data: CreateFoodDto,
): Promise<FoodLog> => {
  // Ingatan dibaca LEBIH DULU: nama yang pernah dicatat memakai angka yang
  // sama dengan kemarin, dan berat yang tersimpan menutup kolom berat yang
  // dikosongkan user. Lihat food-memory.ts.
  const ingatan = cocokkanIngatan(await bacaIngatan(userId), data.items);
  const adaFoto = photo !== null;

  if (!adaFoto) {
    // Tanpa foto, berat hanya bisa datang dari user atau ingatan. Item dari
    // kemasan tidak butuh berat: kalorinya sudah per porsi.
    const tanpaBerat = data.items
      .filter((item, i) => kebutuhanModel(item, ingatan[i] ?? null).berat)
      .map((i) => i.name);

    if (tanpaBerat.length > 0) {
      throw AppError.badRequest(
        `Tanpa foto, isi perkiraan berat untuk: ${tanpaBerat.join(', ')}. Atau lampirkan foto supaya ditaksir dari sana.`,
      );
    }
  }

  const converted = photo === null ? null : await convertToWebP(photo);

  // Yang dikirim ke prompt: item yang sudah tertutup ingatan ditandai seperti
  // kemasan (gizinya tidak perlu ditaksir) dan beratnya diisi dari ingatan,
  // supaya model cuma mengerjakan sisanya.
  const untukPrompt = data.items.map((item, i) => {
    const ing = ingatan[i];
    if (!ing) return item;
    return {
      ...item,
      weight: item.weight ?? ing.weight_per_portion ?? undefined,
      label: item.label ?? { kcal: ing.per100.kcal },
    };
  });

  const log = await unitOfWork(async (tx) => {
    let fileId: string | null = null;
    let analisaMentah: Record<string, unknown>;

    if (converted) {
      const file = await uploadWebP(
        converted.buffer,
        `food-${Date.now()}.webp`,
        `Foto makanan ${data.meal_type}`,
      );

      // Didaftarkan SEGERA setelah upload berhasil, sebelum langkah berikutnya
      // dijalankan. Kalau didaftarkan belakangan, kegagalan di antara keduanya
      // meninggalkan berkas tanpa cara membersihkannya.
      tx.onRollback(() => removeFileSafely(file.id), `file makanan ${file.id}`);
      fileId = file.id;

      // Yang dikirim ke model salinan kecilnya, bukan yang tersimpan di storage.
      // Kalau semua item dari kemasan, model tidak dipanggil: fotonya tetap
      // disimpan sebagai catatan, tapi tidak ada yang perlu ditaksir.
      analisaMentah = perluModel(data.items, ingatan, true)
        ? await analyzeImages(
            [await toAnalysisBuffer(converted.buffer)],
            foodPrompt(untukPrompt, true),
          )
        : {};
    } else {
      analisaMentah = perluModel(data.items, ingatan, false)
        ? await analyzeText(foodPrompt(untukPrompt, false))
        : {};
    }

    const analisa = susunAnalisa(data.items, analisaMentah, converted ? 'PHOTO' : 'TEXT', ingatan);

    const repo = forUser(userId, tx);

    return repo.create('food_logs', {
      directus_file_id: fileId,
      meal_type: data.meal_type,
      // Disimpan LENGKAP DENGAN hasil perkaliannya. Layar karena itu tidak
      // pernah menghitung sendiri, dan angka yang dibaca user dijamin sama
      // persis dengan yang masuk ke summary harian.
      ai_analysis: analisa as unknown as Record<string, unknown>,
      total_calories: analisa.total_calories,
      protein_g: analisa.protein_g.toFixed(2),
      carbs_g: analisa.carbs_g.toFixed(2),
      fat_g: analisa.fat_g.toFixed(2),
      logged_at: data.logged_at ?? new Date().toISOString(),
    });
  });

  await recordActivitySafely(userId);

  return denganFoto(log);
};

/** Satu saran nama untuk form makanan, siap dipakai tanpa memanggil model. */
export interface FoodSuggestion {
  name: string;
  unit: 'g' | 'ml';
  weight_per_portion: number | null;
  label: { kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number } | null;
  kcal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  origin: 'LABEL' | 'EDITED' | 'AI';
  times: number;
  last_logged_at: string;
}

/**
 * Saran nama dari catatan user sendiri. Kosong berarti yang paling sering.
 * Ini yang membuat rutinitas harian jadi dua ketukan: ketik "nes", pilih
 * "Nescafe Classic bubuk", berat dan gizinya ikut terisi.
 */
export const suggestions = async (userId: string, cari: string): Promise<FoodSuggestion[]> =>
  saranMakanan(await bacaIngatan(userId), cari).map((m) => ({
    name: m.name,
    unit: m.unit,
    weight_per_portion: m.weight_per_portion,
    label: m.label,
    kcal_per_100: m.per100.kcal,
    protein_per_100: m.per100.protein,
    carbs_per_100: m.per100.carbs,
    fat_per_100: m.per100.fat,
    origin: m.origin,
    times: m.times,
    last_logged_at: m.last_logged_at,
  }));

export interface FoodDay {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  logs: FoodLog[];
}

export const getByDate = async (userId: string, date: string): Promise<FoodDay> => {
  const repo = forUser(userId);
  const filter = timestampDayFilter(date);

  // Lima query yang tidak saling bergantung. Berurutan berarti menumpuk lima
  // kali latensi HTTP; paralel cuma selama yang paling lambat.
  const [logs, kalori, protein, karbo, lemak] = await Promise.all([
    repo.list('food_logs', { filter, sort: ['logged_at'], limit: -1 }),
    repo.sum('food_logs', 'total_calories', filter),
    repo.sum('food_logs', 'protein_g', filter),
    repo.sum('food_logs', 'carbs_g', filter),
    repo.sum('food_logs', 'fat_g', filter),
  ]);

  return {
    date,
    total_calories: kalori,
    total_protein_g: protein,
    total_carbs_g: karbo,
    total_fat_g: lemak,
    logs: logs.map(denganFoto),
  };
};

export const getToday = async (userId: string): Promise<FoodDay> =>
  getByDate(userId, todayInJakarta());

/** Membaca ai_analysis lama dengan hati-hati: kolomnya JSON bebas. */
const analisaTersimpan = (log: FoodLogRecord): FoodAnalysis | null => {
  const a = log.ai_analysis as Partial<FoodAnalysis> | null;
  if (!a || !Array.isArray(a.items)) return null;
  return a as FoodAnalysis;
};

/**
 * Mengoreksi sesi makan, TANPA memanggil model lagi.
 *
 * Nilai gizi per 100 tiap item sudah tersimpan dari analisa pertama, jadi
 * mengubah nama, jumlah porsi, atau berat cukup dihitung ulang di sini. Item
 * dicocokkan ke yang tersimpan lewat urutannya. Item yang belum pernah
 * dianalisa (daftar lebih panjang dari yang tersimpan) ditolak: itu makanan
 * baru, dan makanan baru adalah sesi baru.
 *
 * Hasil model tetap tersimpan di `raw`, dan sesinya ditandai user_edited
 * supaya jelas angkanya sudah bukan murni taksiran.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateFoodDto,
): Promise<FoodLog> => {
  const repo = forUser(userId);

  // Lewat findById supaya log milik user lain dibalas 404, bukan ikut terubah.
  const log = await repo.findById('food_logs', logId);

  const perubahan: Record<string, unknown> = {};

  if (data.meal_type !== undefined) perubahan.meal_type = data.meal_type;

  if (data.items !== undefined) {
    const lama = analisaTersimpan(log);

    if (!lama) {
      throw AppError.badRequest('Catatan ini tidak punya rincian item yang bisa dikoreksi');
    }

    if (data.items.length > lama.items.length) {
      throw AppError.badRequest(
        'Menambah makanan baru butuh taksiran gizi baru. Catat sebagai sesi makan baru.',
      );
    }

    const dihitung = data.items.map((item: FoodItemEditDto, i) => {
      // Daftar lebih pendek berarti user menghapus item; yang tersisa
      // dicocokkan berurutan dan aman karena panjangnya sudah dijamin.
      const asal = lama.items[i];
      if (!asal) throw AppError.badRequest('Item tidak dikenali');

      // Berat yang tersimpan dipakai kalau user tidak menyebut yang baru.
      const denganBerat =
        item.weight === undefined ? { ...item, weight: asal.weight_per_portion } : item;

      return hitungItem(
        denganBerat,
        null,
        {
          kcal: asal.kcal_per_100,
          protein: asal.protein_per_100,
          carbs: asal.carbs_per_100,
          fat: asal.fat_per_100,
          missing: asal.nutrition_missing,
        },
        null,
        // Asal gizinya dipertahankan: koreksi porsi tidak mengubah PREVIOUS
        // jadi AI, angkanya memang masih yang dipakai ulang.
        asal.nutrition_source === 'PREVIOUS' ? 'PREVIOUS' : 'AI',
      );
    });

    const baru: FoodAnalysis = {
      ...lama,
      items: dihitung,
      ...jumlahkan(dihitung),
      user_edited: true,
    };

    perubahan.ai_analysis = baru;
    perubahan.total_calories = baru.total_calories;
    perubahan.protein_g = baru.protein_g.toFixed(2);
    perubahan.carbs_g = baru.carbs_g.toFixed(2);
    perubahan.fat_g = baru.fat_g.toFixed(2);
  }

  return denganFoto(await repo.update('food_logs', logId, perubahan));
};

/**
 * Menghapus sesi makan beserta fotonya kalau ada.
 *
 * Berkas dihapus dari Directus LEBIH DULU, baru record-nya, sesuai CLAUDE.md
 * section 5. Kalau urutannya dibalik dan penghapusan berkas gagal, tidak ada
 * lagi yang menyimpan id berkas itu dan ia jadi yatim tanpa jejak.
 */
export const remove = async (userId: string, logId: string): Promise<void> => {
  const repo = forUser(userId);

  const log = await repo.findById('food_logs', logId);

  if (log.directus_file_id) {
    try {
      await removeFile(log.directus_file_id);
    } catch (error) {
      // Berkas yang memang sudah tidak ada bukan alasan menolak penghapusan
      // record, hasil akhirnya justru yang diinginkan user.
      if (!isNotFound(error)) throw error;
    }
  }

  await repo.remove('food_logs', logId);
};

const isNotFound = (error: unknown): boolean => {
  if (error instanceof AppError) return error.statusCode === 404;

  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const { errors } = error as { errors: { extensions?: { code?: string } }[] };
    return errors[0]?.extensions?.code === 'FORBIDDEN';
  }

  return false;
};
