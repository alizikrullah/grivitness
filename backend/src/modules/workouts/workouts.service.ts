import { readItems } from '@directus/sdk';

import { directus } from '../../config/directus.js';
import type { CalorieSource } from '../../constants/enums.js';
import { withRetry } from '../../data/retry.js';
import { forUser } from '../../data/scoped.js';
import { loadUserMetrics } from '../../data/user-metrics.js';
import type {
  CustomWorkoutRecord,
  WorkoutLibraryRecord,
  WorkoutLogRecord,
} from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { caloriesFromWorkout } from '../../utils/calories.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { toNumber } from '../../utils/number.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type {
  CreateCustomWorkoutDto,
  CreateWorkoutDto,
  LibraryQueryDto,
  UpdateWorkoutDto,
} from './workouts.validation.js';

/**
 * workout_library itu data GLOBAL, bukan milik user, jadi memang tidak lewat
 * forUser(). Ini salah satu pengecualian yang disebut CLAUDE.md section 4.
 */
export const getLibrary = async (query: LibraryQueryDto): Promise<WorkoutLibraryRecord[]> => {
  const filter: Record<string, unknown> = {};

  if (query.category) filter.category = { _eq: query.category };
  if (query.search) filter.name = { _icontains: query.search };

  return withRetry(
    () =>
      directus.request(
        readItems('workout_library', {
          filter,
          sort: ['name'],
          limit: -1,
        }),
      ),
    'workout_library.list',
  );
};

export const getCustom = async (userId: string): Promise<CustomWorkoutRecord[]> =>
  forUser(userId).list('custom_workouts', { sort: ['name'], limit: -1 });

export const createCustom = async (
  userId: string,
  data: CreateCustomWorkoutDto,
): Promise<CustomWorkoutRecord> =>
  forUser(userId).create('custom_workouts', {
    name: data.name,
    category: data.category,
    calories_burned_per_minute: data.calories_burned_per_minute,
    description: data.description ?? null,
  });

export const removeCustom = async (userId: string, id: string): Promise<void> => {
  await forUser(userId).remove('custom_workouts', id);
};

/** Berat badan terakhir, atau berat acuan kalau user belum pernah menimbang. */
const beratUntukEstimasi = async (userId: string): Promise<number> =>
  (await loadUserMetrics(userId)).weightKg;

interface SumberOlahraga {
  workout_name: string;
  calories_burned: number;
  calories_source: CalorieSource;
}

/**
 * Menentukan nama dan kalori berdasarkan sumber olahraganya.
 *
 * Nama selalu dari sumbernya. Kalori: kalau user mengisi sendiri, angka itu
 * yang dipakai untuk sumber apa pun dan ditandai MANUAL. Kalau tidak, dihitung
 * dari MET library/custom dan ditandai MET.
 *
 * Dulu angka dari client diabaikan untuk library/custom, dengan alasan client
 * bisa mengarang. Itu dicabut: yang mengisi adalah pemilik datanya sendiri,
 * dan angka jam tangan untuk satu sesi jalan kaki jauh lebih dekat ke kenyataan
 * daripada taksiran MET. Yang dijaga sekarang adalah ASALNYA tercatat, supaya
 * angka manual tidak pernah dihitung ulang diam-diam.
 */
const resolveSumber = async (userId: string, data: CreateWorkoutDto): Promise<SumberOlahraga> => {
  const manual = data.calories_burned;

  const dariMet = (kkalPerMenit: string, weightKg: number): Omit<SumberOlahraga, 'workout_name'> =>
    manual === undefined
      ? {
          calories_burned: caloriesFromWorkout(
            toNumber(kkalPerMenit),
            data.duration_minutes,
            weightKg,
          ),
          calories_source: 'MET',
        }
      : { calories_burned: manual, calories_source: 'MANUAL' };

  if (data.workout_library_id) {
    const [library, weightKg] = await Promise.all([
      withRetry(
        () =>
          directus.request(
            readItems('workout_library', {
              filter: { id: { _eq: data.workout_library_id } },
              limit: 1,
            }),
          ),
        'workout_library.findById',
      ),
      beratUntukEstimasi(userId),
    ]);

    const item = library[0];
    if (!item) {
      throw AppError.notFound('Olahraga tidak ditemukan di library');
    }

    return { workout_name: item.name, ...dariMet(item.calories_burned_per_minute, weightKg) };
  }

  if (data.custom_workout_id) {
    // findById melempar NOT_FOUND kalau custom workout itu milik user lain.
    const [custom, weightKg] = await Promise.all([
      forUser(userId).findById('custom_workouts', data.custom_workout_id),
      beratUntukEstimasi(userId),
    ]);

    return { workout_name: custom.name, ...dariMet(custom.calories_burned_per_minute, weightKg) };
  }

  // Input manual. Zod sudah memastikan kedua field ini terisi ketika tidak ada
  // sumber yang dirujuk, tapi diperiksa ulang di sini daripada memaksa tipe
  // dengan cast. Kalau aturan validasinya berubah suatu saat, yang muncul
  // adalah error yang jelas, bukan undefined yang diam-diam masuk database.
  const nama = data.workout_name;

  if (nama === undefined || manual === undefined) {
    throw AppError.badRequest(
      'Olahraga manual butuh workout_name dan calories_burned, atau pilih dari library / custom workout',
    );
  }

  return { workout_name: nama, calories_burned: manual, calories_source: 'MANUAL' };
};

export const create = async (userId: string, data: CreateWorkoutDto): Promise<WorkoutLogRecord> => {
  const sumber = await resolveSumber(userId, data);

  const log = await forUser(userId).create('workout_logs', {
    workout_library_id: data.workout_library_id ?? null,
    custom_workout_id: data.custom_workout_id ?? null,
    workout_name: sumber.workout_name,
    duration_minutes: data.duration_minutes,
    calories_burned: sumber.calories_burned,
    calories_source: sumber.calories_source,
    intensity: data.intensity,
    tracked_by_device: data.tracked_by_device ?? false,
    notes: data.notes ?? null,
    logged_at: data.logged_at ?? todayInJakarta(),
  });

  await recordActivitySafely(userId);

  return log;
};

export interface WorkoutDay {
  date: string;
  total_minutes: number;
  total_calories: number;
  logs: WorkoutLogRecord[];
}

export const getByDate = async (userId: string, date: string): Promise<WorkoutDay> => {
  const repo = forUser(userId);
  const filter = { logged_at: { _eq: date } };

  // Tiga query yang tidak saling bergantung, jadi dijalankan bersamaan.
  const [logs, totalMinutes, totalCalories] = await Promise.all([
    repo.list('workout_logs', { filter, sort: ['created_at'], limit: -1 }),
    repo.sum('workout_logs', 'duration_minutes', filter),
    repo.sum('workout_logs', 'calories_burned', filter),
  ]);

  return { date, total_minutes: totalMinutes, total_calories: totalCalories, logs };
};

export const getToday = async (userId: string): Promise<WorkoutDay> =>
  getByDate(userId, todayInJakarta());

export const getRange = async (userId: string, range: DateRangeDto): Promise<WorkoutLogRecord[]> =>
  forUser(userId).list('workout_logs', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

/**
 * Mengoreksi log olahraga.
 *
 * Ketika durasinya berubah dan user tidak menyebut kalorinya sendiri, apa yang
 * terjadi pada kalori bergantung ASALNYA:
 *
 *   MET     diskalakan proporsional dari nilai lama, karena nilai lama memang
 *           turunan dari durasi. Lari 20 menit dengan kalori milik sesi 60 menit
 *           adalah dua angka yang saling bertentangan.
 *   MANUAL  DIBIARKAN. Angka itu pengukuran jam tangan (atau ketikan user),
 *           bukan turunan dari durasi. Kalau user cuma membetulkan durasi yang
 *           salah ketik, angka jamnya tidak boleh ikut bergeser diam-diam.
 *
 * Kalau user menyebut kalorinya sendiri, angka itu yang dipakai dan asalnya
 * jadi MANUAL, apa pun asal sebelumnya.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateWorkoutDto,
): Promise<WorkoutLogRecord> => {
  const repo = forUser(userId);

  // findById supaya log milik user lain dibalas 404, bukan ikut terubah.
  const log = await repo.findById('workout_logs', logId);

  const perubahan: Record<string, unknown> = {};

  if (data.workout_name !== undefined) perubahan.workout_name = data.workout_name;
  if (data.intensity !== undefined) perubahan.intensity = data.intensity;
  if (data.notes !== undefined) perubahan.notes = data.notes;
  if (data.tracked_by_device !== undefined) perubahan.tracked_by_device = data.tracked_by_device;

  if (data.duration_minutes !== undefined) {
    perubahan.duration_minutes = data.duration_minutes;

    // Baris lama dari sebelum kolom asalnya ada bernilai null. Semuanya dulu
    // dihitung dari MET (angka client diabaikan), jadi null diperlakukan MET.
    const dariMet = log.calories_source !== 'MANUAL';

    if (data.calories_burned === undefined && dariMet && log.duration_minutes > 0) {
      perubahan.calories_burned = Math.round(
        (log.calories_burned / log.duration_minutes) * data.duration_minutes,
      );
    }
  }

  // Nilai dari user selalu menang atas hasil penskalaan di atas.
  if (data.calories_burned !== undefined) {
    perubahan.calories_burned = data.calories_burned;
    perubahan.calories_source = 'MANUAL';
  }

  return repo.update('workout_logs', logId, perubahan);
};

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('workout_logs', logId);
};
