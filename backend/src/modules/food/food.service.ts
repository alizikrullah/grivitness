import type { FoodDayStatus } from '../../constants/enums.js';
import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { FoodDayStatusRecord, FoodLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { removeFile, removeFileSafely, uploadWebP } from '../../utils/directus-files.js';
import { analyzeImages, analyzeText, foodPrompt, type FoodPromptItem } from '../../utils/groq.js';
import {
  balasanPerItem,
  type FoodAnalysis,
  type FoodItem,
  type FoodItemInput,
  hitungItem,
  type IngatanItem,
  jumlahkan,
  kebutuhanModel,
  type KonteksItem,
  perluModel,
  putuskan,
  susunAnalisa,
} from '../../utils/food-math.js';
import { convertToWebP, toAnalysisBuffer } from '../../utils/sharp.js';
import { timestampDayFilter } from '../../utils/query.js';
import { fileUrl } from '../files/files.service.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import {
  bacaIngatan,
  cocokkanIngatan,
  type FoodMemory,
  giziTersimpan,
  kaloriPerPorsi,
  kunciIngatan,
  saranMakanan,
} from './food-memory.js';
import type {
  CreateFoodDto,
  FoodDayStatusDto,
  FoodItemEditDto,
  ForgetSuggestionDto,
  UpdateFoodDto,
} from './food.validation.js';

/** Bentuk yang dikirim ke client: record ditambah URL foto yang dirangkai dari id berkasnya. */
export type FoodLog = FoodLogRecord & { photo_url: string | null };

const denganFoto = (log: FoodLogRecord): FoodLog => ({
  ...log,
  photo_url: log.directus_file_id ? fileUrl(log.directus_file_id) : null,
});

/**
 * Item untuk prompt: berat yang sudah diketahui ikut dikirim supaya model tidak
 * menaksirnya, dan item yang gizi serta gulanya sudah diketahui ditandai
 * supaya model tidak mengerjakannya.
 *
 * Berat kosong + foto berarti "lihat porsinya dari foto", walau catatan yang
 * dipilih menyimpan berat. Tanpa foto, berat tersimpan yang dikirim.
 */
const untukPrompt = (
  items: FoodItemInput[],
  tersimpan: (IngatanItem | null)[],
  adaFoto: boolean,
  hanyaYangBaru: boolean[] | null = null,
): FoodPromptItem[] =>
  items.map((item, i) => {
    const simpan = tersimpan[i] ?? null;
    const butuh = kebutuhanModel(item, simpan, adaFoto);
    const ditanya = hanyaYangBaru === null || hanyaYangBaru[i] === true;
    const berat =
      item.weight ?? (butuh.berat ? undefined : (simpan?.weight_per_portion ?? undefined));

    return {
      name: item.name,
      portions: item.portions,
      unit: item.unit,
      ...(berat === undefined ? {} : { weight: berat }),
      skip_nutrition: !ditanya || (!butuh.gizi && !butuh.gula),
    };
  });

/** Kolom angka food_logs dari sebuah analisa. Satu tempat supaya tidak ada yang tertinggal. */
const kolomAngka = (a: FoodAnalysis) => ({
  total_calories: a.total_calories,
  protein_g: a.protein_g.toFixed(2),
  carbs_g: a.carbs_g.toFixed(2),
  fat_g: a.fat_g.toFixed(2),
  sugar_g: a.sugar_g.toFixed(2),
});

/**
 * Mencatat satu sesi makan.
 *
 * Fotonya opsional. Dengan foto: diunggah ke storage, salinan kecilnya dikirim
 * ke model vision untuk menaksir berat item yang beratnya dikosongkan user.
 * Tanpa foto: setiap item wajib punya berat, dan model teks cuma diminta nilai
 * gizinya.
 *
 * Item yang dipilih dari saran (from_memory) memakai gizi catatan sebelumnya
 * dan tidak ditanyakan ke model. Item yang diketik ditaksir dari nol, walau
 * namanya sama persis.
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
  const adaFoto = photo !== null;

  // Ingatan cuma dibaca kalau memang ada item yang diklik dari saran.
  const ingatan: (FoodMemory | null)[] = data.items.some((i) => i.from_memory)
    ? cocokkanIngatan(await bacaIngatan(userId), data.items)
    : data.items.map(() => null);

  if (!adaFoto) {
    // Tanpa foto, berat hanya bisa datang dari user atau catatan yang dipilih.
    // Item dari kemasan tidak butuh berat: kalorinya sudah per porsi.
    const tanpaBerat = data.items
      .filter((item, i) => kebutuhanModel(item, ingatan[i] ?? null, false).berat)
      .map((i) => i.name);

    if (tanpaBerat.length > 0) {
      throw AppError.badRequest(
        `Tanpa foto, isi perkiraan berat untuk: ${tanpaBerat.join(', ')}. Atau lampirkan foto supaya ditaksir dari sana.`,
      );
    }
  }

  const converted = photo === null ? null : await convertToWebP(photo);
  const perlu = perluModel(data.items, ingatan, adaFoto);
  const prompt = foodPrompt(untukPrompt(data.items, ingatan, adaFoto), adaFoto);

  const log = await unitOfWork(async (tx) => {
    let fileId: string | null = null;
    let analisaMentah: Record<string, unknown> = {};

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
      // Kalau semua item tertutup kemasan dan catatan, model tidak dipanggil:
      // fotonya tetap disimpan, tapi kecocokannya ditandai "tidak diperiksa".
      if (perlu) {
        analisaMentah = await analyzeImages([await toAnalysisBuffer(converted.buffer)], prompt);
      }
    } else if (perlu) {
      analisaMentah = await analyzeText(prompt);
    }

    const analisa = susunAnalisa(data.items, analisaMentah, converted ? 'PHOTO' : 'TEXT', {
      ingatan,
      modelDipanggil: perlu,
    });

    const repo = forUser(userId, tx);

    return repo.create('food_logs', {
      directus_file_id: fileId,
      meal_type: data.meal_type,
      // Disimpan LENGKAP DENGAN hasil perkaliannya. Layar karena itu tidak
      // pernah menghitung sendiri, dan angka yang dibaca user dijamin sama
      // persis dengan yang masuk ke summary harian.
      ai_analysis: analisa as unknown as Record<string, unknown>,
      ...kolomAngka(analisa),
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
  label: {
    kcal: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    sugar_g?: number;
  } | null;
  kcal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  /** Kalori satu porsi kalau saran ini dipilih apa adanya, untuk ditampilkan di chip. */
  kcal_per_portion: number | null;
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
    kcal_per_portion: kaloriPerPorsi(m),
    origin: m.origin,
    times: m.times,
    last_logged_at: m.last_logged_at,
  }));

/**
 * Melupakan satu nama dari ingatan makanan (tekan lama chip saran).
 *
 * Catatan lamanya tidak dihapus, cuma berhenti jadi sumber saran. Catatan yang
 * dibuat sesudahnya membangun ingatan dari nol, jadi angka yang salah tidak
 * bisa hidup lagi lewat salinannya. Melupakan lagi memperbarui waktunya.
 */
export const forgetSuggestion = async (
  userId: string,
  data: ForgetSuggestionDto,
): Promise<{ forgotten: true }> => {
  const repo = forUser(userId);
  const key = kunciIngatan(data.name, data.unit);
  const sekarang = new Date().toISOString();

  const ada = await repo.findOne('food_memory_forgets', { filter: { memory_key: { _eq: key } } });

  if (ada) {
    await repo.update('food_memory_forgets', ada.id, { forgotten_at: sekarang });
  } else {
    await repo.create('food_memory_forgets', {
      memory_key: key,
      user_key: `${userId}:${key}`,
      forgotten_at: sekarang,
    });
  }

  return { forgotten: true };
};

/**
 * Jawaban "belum lengkap" atau "memang segini" untuk satu hari. Upsert: jawaban
 * boleh diubah, misalnya setelah makan yang terlupa akhirnya dicatat.
 */
export const setDayStatus = async (
  userId: string,
  data: FoodDayStatusDto,
): Promise<FoodDayStatusRecord> => {
  if (data.date > todayInJakarta()) {
    throw AppError.badRequest('Tanggal itu belum terjadi');
  }

  const repo = forUser(userId);
  const ada = await repo.findOne('food_day_status', { filter: { logged_at: { _eq: data.date } } });

  return ada
    ? repo.update('food_day_status', ada.id, { status: data.status })
    : repo.create('food_day_status', {
        status: data.status,
        logged_at: data.date,
        user_date_key: dailyKey(userId, data.date),
      });
};

export interface FoodDay {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  total_sugar_g: number;
  /** Jawaban user soal lengkap tidaknya catatan hari ini, null kalau belum. */
  day_status: FoodDayStatus | null;
  logs: FoodLog[];
}

export const getByDate = async (userId: string, date: string): Promise<FoodDay> => {
  const repo = forUser(userId);
  const filter = timestampDayFilter(date);

  // Query yang tidak saling bergantung. Berurutan berarti menumpuk latensi
  // HTTP; paralel cuma selama yang paling lambat.
  const [logs, kalori, protein, karbo, lemak, gula, status] = await Promise.all([
    repo.list('food_logs', { filter, sort: ['logged_at'], limit: -1 }),
    repo.sum('food_logs', 'total_calories', filter),
    repo.sum('food_logs', 'protein_g', filter),
    repo.sum('food_logs', 'carbs_g', filter),
    repo.sum('food_logs', 'fat_g', filter),
    repo.sum('food_logs', 'sugar_g', filter),
    repo.findOne('food_day_status', { filter: { logged_at: { _eq: date } } }),
  ]);

  return {
    date,
    total_calories: kalori,
    total_protein_g: protein,
    total_carbs_g: karbo,
    total_fat_g: lemak,
    total_sugar_g: Math.round(gula * 10) / 10,
    day_status: status?.status ?? null,
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
 * Item tersimpan mana yang dikoreksi oleh tiap item kiriman.
 *
 * Urutan pencocokan: source_index dari client (pasti benar), lalu nama dan
 * satuan yang sama, lalu urutan. Dulu cuma urutan: menghapus item kedua dari
 * tiga membuat item ketiga mewarisi gizi item kedua.
 */
export const pasangkanAsal = (lama: FoodItem[], baru: FoodItemEditDto[]): number[] => {
  const dipakai = new Set<number>();
  const hasil = baru.map(() => -1);

  const pasang = (i: number, j: number): void => {
    hasil[i] = j;
    dipakai.add(j);
  };

  baru.forEach((item, i) => {
    const j = item.source_index;
    if (j !== undefined && j < lama.length && !dipakai.has(j)) pasang(i, j);
  });

  baru.forEach((item, i) => {
    if (hasil[i] !== -1) return;
    const kunci = kunciIngatan(item.name, item.unit);
    const j = lama.findIndex((l, k) => !dipakai.has(k) && kunciIngatan(l.name, l.unit) === kunci);
    if (j !== -1) pasang(i, j);
  });

  baru.forEach((_, i) => {
    if (hasil[i] !== -1) return;
    const j = i < lama.length && !dipakai.has(i) ? i : lama.findIndex((__, k) => !dipakai.has(k));
    if (j !== -1) pasang(i, j);
  });

  return hasil;
};

/**
 * Mengoreksi sesi makan.
 *
 * Mengubah porsi atau berat cukup dihitung ulang dari nilai per 100 yang
 * tersimpan, TANPA memanggil model. Mengganti nama atau satuan berarti
 * makanan lain: item ITU ditaksir ulang (model teks, atau catatan kalau user
 * memilihnya dari saran, atau kemasan kalau diisi), item lain tidak
 * tersentuh. Dulu nama baru tetap memakai gizi lama: "nasi putih" diganti
 * "nasi merah" tetap dihitung nasi putih.
 *
 * Menambah makanan baru ditolak: itu sesi baru. Hasil model tetap tersimpan
 * di `raw`, dan sesinya ditandai user_edited supaya jelas angkanya sudah
 * bukan murni taksiran.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateFoodDto,
): Promise<FoodLog> => {
  const repo = forUser(userId);

  // Lewat findById supaya log milik user lain dibalas 404, bukan ikut terubah.
  const log = await repo.findById('food_logs', logId);
  const lama = analisaTersimpan(log);

  const perubahan: Record<string, unknown> = {};
  if (data.meal_type !== undefined) perubahan.meal_type = data.meal_type;

  let analisa: FoodAnalysis | null = null;

  if (data.items !== undefined) {
    if (!lama) {
      throw AppError.badRequest('Catatan ini tidak punya rincian item yang bisa dikoreksi');
    }

    if (data.items.length > lama.items.length) {
      throw AppError.badRequest(
        'Menambah makanan baru butuh taksiran gizi baru. Catat sebagai sesi makan baru.',
      );
    }

    analisa = await koreksiItem(userId, lama, data.items);
  }

  // Tombol Abaikan: user menyatakan fotonya memang foto makanan ini. Balasan
  // model aslinya tetap tersimpan di raw. Tanpa tanda, tidak ada yang diubah.
  const sekarang = analisa ?? lama;
  if (data.dismiss_photo_note && sekarang?.photo_matches === false) {
    analisa = {
      ...sekarang,
      photo_matches: true,
      photo_note: null,
      photo_dismissed: true,
    };
  }

  if (analisa) {
    perubahan.ai_analysis = analisa;
    if (data.items !== undefined) Object.assign(perubahan, kolomAngka(analisa));
  }

  return denganFoto(await repo.update('food_logs', logId, perubahan));
};

/** Menghitung ulang daftar item yang dikoreksi. Lihat update(). */
const koreksiItem = async (
  userId: string,
  lama: FoodAnalysis,
  kiriman: FoodItemEditDto[],
): Promise<FoodAnalysis> => {
  const asalIndex = pasangkanAsal(lama.items, kiriman);
  const peta = kiriman.some((i) => i.from_memory) ? await bacaIngatan(userId) : null;

  interface Rencana {
    item: FoodItemInput;
    konteks: Omit<KonteksItem, 'model'>;
    baru: boolean;
  }

  const rencana: Rencana[] = kiriman.map((kirim, i) => {
    const asal = lama.items[asalIndex[i] ?? -1];
    if (!asal) throw AppError.badRequest('Item tidak dikenali');

    // source_index hanya alat pencocokan, bukan bagian item.
    const { source_index: _abaikan, ...item } = kirim;

    const namaSama = kunciIngatan(asal.name, asal.unit) === kunciIngatan(item.name, item.unit);
    // Kemasan yang diketik user lalu dicabut: angkanya tidak bisa dipakai
    // tanpa kemasannya, jadi ditaksir ulang.
    const kemasanDicabut = asal.nutrition_source === 'LABEL' && !item.label;

    if (namaSama && !kemasanDicabut) {
      return {
        item,
        baru: false,
        konteks: {
          tersimpan: giziTersimpan(asal),
          asalTersimpan: {
            gizi: asal.nutrition_source,
            gula: asal.sugar_source ?? null,
            berat: asal.weight_source,
          },
        },
      };
    }

    // Makanan lain. Berat tersimpan dipakai kalau user tidak menyebut yang
    // baru; catatan dari saran dipakai kalau user memilihnya.
    const ingatan =
      item.from_memory && peta ? (peta.get(kunciIngatan(item.name, item.unit)) ?? null) : null;
    const denganBerat =
      item.weight === undefined && asal.weight_per_portion > 0
        ? { ...item, weight: asal.weight_per_portion }
        : item;

    return { item: denganBerat, baru: true, konteks: { tersimpan: ingatan } };
  });

  // Hanya item yang benar-benar baru yang boleh membuat model dipanggil.
  // Item lama yang gulanya belum diketahui tidak memicu apa pun: koreksi porsi
  // tidak boleh jadi alasan menunggu model.
  const tanpaBerat = rencana
    .filter((r) => r.baru && kebutuhanModel(r.item, r.konteks.tersimpan ?? null, false).berat)
    .map((r) => r.item.name);
  if (tanpaBerat.length > 0) {
    throw AppError.badRequest(`Isi perkiraan berat untuk: ${tanpaBerat.join(', ')}.`);
  }

  const ditanya = rencana.map((r) => {
    if (!r.baru) return false;
    const butuh = kebutuhanModel(r.item, r.konteks.tersimpan ?? null, false);
    return butuh.gizi || butuh.gula;
  });

  const items = rencana.map((r) => r.item);
  const mentah = ditanya.some(Boolean)
    ? await analyzeText(
        foodPrompt(
          untukPrompt(
            items,
            rencana.map((r) => r.konteks.tersimpan ?? null),
            false,
            ditanya,
          ),
          false,
        ),
      )
    : null;
  const balasan = mentah === null ? [] : balasanPerItem(mentah, items.length);

  const dihitung = rencana.map((r, i) =>
    hitungItem(
      r.item,
      putuskan(r.item, { ...r.konteks, model: ditanya[i] ? (balasan[i] ?? null) : null }),
    ),
  );

  return {
    ...lama,
    items: dihitung,
    ...jumlahkan(dihitung),
    user_edited: true,
    raw: mentah === null ? lama.raw : { ...lama.raw, koreksi: mentah },
  };
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
