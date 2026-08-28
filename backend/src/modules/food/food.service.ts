import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { FoodLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { removeFile, removeFileSafely, uploadWebP } from '../../utils/directus-files.js';
import { analyzeImages, foodPrompt } from '../../utils/groq.js';
import { logger } from '../../utils/logger.js';
import { convertToWebP, toAnalysisBuffer } from '../../utils/sharp.js';
import { timestampDayFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateFoodDto, UpdateFoodDto } from './food.validation.js';

/**
 * Satu bahan di dalam piring, sesudah dihitung backend.
 *
 * Nilai per 100 gram dan taksiran beratnya datang dari model. Empat field
 * terakhir adalah hasil perkalian, dan itu dikerjakan di sini.
 */
export interface ItemMakanan {
  name: string;
  grams: number;
  kcal_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fat_per_100g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Bentuk hasil analisa Groq yang dipakai sebagai kolom tersendiri.
 * Field-nya di-extract supaya summary harian bisa mengagregasi tanpa harus
 * mem-parse JSON di setiap baris.
 */
interface AnalisaMakanan {
  items: ItemMakanan[];
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Mengambil angka gizi dari respons AI.
 *
 * Model bisa saja membalas field yang hilang atau bertipe aneh walaupun sudah
 * diminta format tertentu. Nilai yang tidak terbaca diperlakukan sebagai nol
 * daripada menggagalkan seluruh pencatatan: foto dan analisanya tetap tersimpan
 * utuh di ai_analysis, dan user bisa mengoreksi angkanya.
 */
const angka = (nilai: unknown): number => {
  const parsed = typeof nilai === 'string' ? Number(nilai) : nilai;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Batas atas yang berasal dari sifat makanannya sendiri, bukan dari selera.
 *
 * Lemak murni adalah bahan pangan terpadat yang ada, 900 kkal per 100 gram, jadi
 * apa pun di atas itu pasti keliru. Begitu juga satu makro tidak mungkin lebih
 * dari 100 gram di dalam 100 gram bahan. Batas beratnya lebih longgar karena
 * cuma untuk menangkal salah ketik nol, bukan untuk menilai porsi.
 */
const MAKS_GRAM = 3000;
const MAKS_KKAL_PER_100G = 900;
const MAKS_MAKRO_PER_100G = 100;

const batas = (nilai: number, maks: number): number => (nilai > maks ? maks : nilai);

const bulat = (nilai: number, desimal: number): number => {
  const faktor = 10 ** desimal;
  return Math.round(nilai * faktor) / faktor;
};

/**
 * Menghitung satu bahan dari taksiran model.
 *
 * Model HANYA menaksir: berapa gram, dan berapa gizinya per 100 gram. Semua
 * perkalian dikerjakan di sini, persis seperti aturan di fitur chat bahwa model
 * tidak boleh menghitung apa pun. Salah kali-kalian dari model karena itu tidak
 * mungkin sampai ke angka yang dilihat user.
 */
const hitungItem = (mentah: unknown): ItemMakanan | null => {
  if (typeof mentah !== 'object' || mentah === null || Array.isArray(mentah)) return null;

  const r = mentah as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';

  // Bahan tanpa nama tidak bisa ditampilkan maupun dikoreksi user, jadi lebih
  // baik dibuang daripada muncul sebagai baris kosong yang menambah kalori.
  if (name === '') return null;

  const gram = batas(angka(r.grams), MAKS_GRAM);
  const kkal100 = batas(angka(r.kcal_per_100g), MAKS_KKAL_PER_100G);
  const protein100 = batas(angka(r.protein_per_100g), MAKS_MAKRO_PER_100G);
  const karbo100 = batas(angka(r.carbs_per_100g), MAKS_MAKRO_PER_100G);
  const lemak100 = batas(angka(r.fat_per_100g), MAKS_MAKRO_PER_100G);

  const rasio = gram / 100;

  return {
    name,
    grams: Math.round(gram),
    kcal_per_100g: Math.round(kkal100),
    protein_per_100g: bulat(protein100, 1),
    carbs_per_100g: bulat(karbo100, 1),
    fat_per_100g: bulat(lemak100, 1),
    calories: Math.round(kkal100 * rasio),
    protein_g: bulat(protein100 * rasio, 1),
    carbs_g: bulat(karbo100 * rasio, 1),
    fat_g: bulat(lemak100 * rasio, 1),
  };
};

const jumlah = (items: ItemMakanan[], ambil: (item: ItemMakanan) => number): number =>
  items.reduce((total, item) => total + ambil(item), 0);

const extractAnalisa = (raw: Record<string, unknown>): AnalisaMakanan => {
  const daftar = Array.isArray(raw.items) ? raw.items : [];
  const items = daftar
    .map(hitungItem)
    .filter((item): item is ItemMakanan => item !== null)
    // Bahan tanpa berat tidak menyumbang kalori apa pun dan cuma jadi baris
    // membingungkan di layar.
    .filter((item) => item.grams > 0);

  if (items.length === 0) {
    // Bentuk lama: model langsung menyebut totalnya tanpa menguraikan bahannya.
    // Masih diterima supaya satu balasan yang tidak menurut format tidak
    // menggagalkan pencatatan yang fotonya sudah terlanjur diunggah.
    logger.warn('Analisa makanan tidak memuat rincian bahan, memakai total dari model');

    return {
      items: [],
      total_calories: Math.round(angka(raw.total_calories)),
      protein_g: angka(raw.protein_g),
      carbs_g: angka(raw.carbs_g),
      fat_g: angka(raw.fat_g),
    };
  }

  return {
    items,
    total_calories: Math.round(jumlah(items, (i) => i.calories)),
    protein_g: bulat(
      jumlah(items, (i) => i.protein_g),
      1,
    ),
    carbs_g: bulat(
      jumlah(items, (i) => i.carbs_g),
      1,
    ),
    fat_g: bulat(
      jumlah(items, (i) => i.fat_g),
      1,
    ),
  };
};

/**
 * Mencatat makanan dari foto.
 *
 * Ini operasi lintas sistem: file diunggah ke Directus storage, AI dipanggil,
 * lalu record dibuat di database. Karena Directus tidak punya transaction,
 * seluruhnya dibungkus unitOfWork, termasuk file yang sudah terlanjur
 * terunggah, yang didaftarkan lewat onRollback.
 *
 * Tanpa itu, kegagalan di langkah mana pun setelah upload akan meninggalkan
 * file yatim di storage yang tidak dirujuk baris mana pun.
 */
export const create = async (
  userId: string,
  photo: Buffer,
  data: CreateFoodDto,
): Promise<FoodLogRecord> => {
  const converted = await convertToWebP(photo);

  const log = await unitOfWork(async (tx) => {
    const file = await uploadWebP(
      converted.buffer,
      `food-${Date.now()}.webp`,
      `Foto makanan ${data.meal_type}`,
    );

    // Didaftarkan SEGERA setelah upload berhasil, sebelum langkah berikutnya
    // dijalankan. Kalau didaftarkan belakangan, kegagalan di antara keduanya
    // meninggalkan file tanpa cara membersihkannya.
    tx.onRollback(() => removeFileSafely(file.id), `file makanan ${file.id}`);

    // Yang dikirim ke AI salinan kecilnya, bukan yang tersimpan di storage.
    // Catatan user ikut dikirim sebagai konteks, tanpa itu AI cuma menebak
    // dari rupa makanannya dan sering keliru pada hidangan yang mirip.
    const analisaMentah = await analyzeImages(
      [await toAnalysisBuffer(converted.buffer)],
      foodPrompt(data.notes),
    );
    const analisa = extractAnalisa(analisaMentah);

    // foods_detected diturunkan dari nama bahan supaya tampilan dan fitur
    // koreksi yang sudah memakainya tetap bekerja. Dibiarkan apa adanya kalau
    // model tidak menguraikan bahannya, supaya daftar lamanya tidak terhapus.
    const rincian =
      analisa.items.length > 0
        ? { items: analisa.items, foods_detected: analisa.items.map((item) => item.name) }
        : {};

    const repo = forUser(userId, tx);

    return repo.create('food_logs', {
      photo_url: file.url,
      directus_file_id: file.id,
      meal_type: data.meal_type,
      // Respons AI disimpan UTUH, bukan cuma angka yang di-extract. Kalau
      // suatu saat butuh tingkat keyakinannya, datanya sudah ada tanpa perlu
      // menganalisa ulang.
      //
      // Rincian bahan ditulis kembali LENGKAP DENGAN hasil perkaliannya. Layar
      // karena itu tidak pernah menghitung sendiri, dan angka yang dibaca user
      // dijamin sama persis dengan yang masuk ke summary harian.
      ai_analysis: {
        ...analisaMentah,
        ...rincian,
        total_calories: analisa.total_calories,
        protein_g: analisa.protein_g,
        carbs_g: analisa.carbs_g,
        fat_g: analisa.fat_g,
      },
      total_calories: data.total_calories ?? analisa.total_calories,
      protein_g: (data.protein_g ?? analisa.protein_g).toFixed(2),
      carbs_g: (data.carbs_g ?? analisa.carbs_g).toFixed(2),
      fat_g: (data.fat_g ?? analisa.fat_g).toFixed(2),
      notes: data.notes ?? null,
      logged_at: data.logged_at ?? new Date().toISOString(),
    });
  });

  await recordActivitySafely(userId);

  return log;
};

export interface FoodDay {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  logs: FoodLogRecord[];
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
    logs,
  };
};

export const getToday = async (userId: string): Promise<FoodDay> =>
  getByDate(userId, todayInJakarta());

/**
 * Mengoreksi log makanan yang sudah tercatat.
 *
 * Hanya field yang benar-benar dikirim yang disentuh. Menyalin seluruh objek
 * akan menimpa kolom yang tidak disebut dengan undefined, dan koreksi kecil
 * seperti membetulkan nama hidangan justru menghapus angka gizinya.
 *
 * Perubahan pada daftar makanan ditulis ke dalam ai_analysis, bukan menimpanya.
 * Hasil asli dari AI tetap dipertahankan supaya masih bisa dibandingkan, dan
 * ditandai user_edited agar jelas angkanya sudah tidak murni dari model.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateFoodDto,
): Promise<FoodLogRecord> => {
  const repo = forUser(userId);

  // Lewat findById supaya log milik user lain dibalas 404, bukan ikut terubah.
  const log = await repo.findById('food_logs', logId);

  const perubahan: Record<string, unknown> = {};

  if (data.meal_type !== undefined) perubahan.meal_type = data.meal_type;
  if (data.notes !== undefined) perubahan.notes = data.notes;
  if (data.total_calories !== undefined) perubahan.total_calories = data.total_calories;
  if (data.protein_g !== undefined) perubahan.protein_g = data.protein_g.toFixed(2);
  if (data.carbs_g !== undefined) perubahan.carbs_g = data.carbs_g.toFixed(2);
  if (data.fat_g !== undefined) perubahan.fat_g = data.fat_g.toFixed(2);

  if (data.foods_detected !== undefined) {
    perubahan.ai_analysis = {
      ...log.ai_analysis,
      foods_detected: data.foods_detected,
      user_edited: true,
    };
  }

  return repo.update('food_logs', logId, perubahan);
};

/**
 * Menghapus log makanan beserta fotonya.
 *
 * File dihapus dari Directus LEBIH DULU, baru record-nya, sesuai CLAUDE.md
 * section 5. Kalau urutannya dibalik dan penghapusan file gagal, tidak ada
 * lagi yang menyimpan id file itu dan ia jadi yatim tanpa jejak.
 */
export const remove = async (userId: string, logId: string): Promise<void> => {
  const repo = forUser(userId);

  const log = await repo.findById('food_logs', logId);

  if (log.directus_file_id) {
    try {
      await removeFile(log.directus_file_id);
    } catch (error) {
      // File yang memang sudah tidak ada bukan alasan menolak penghapusan
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
