import { readItems } from '@directus/sdk';

import { directus } from '../../config/directus.js';
import { withRetry } from '../../data/retry.js';
import { forUser } from '../../data/scoped.js';
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

/** Berat acuan yang dipakai nilai kalori di library. */
const BERAT_ACUAN_KG = 70;

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
const beratUntukEstimasi = async (userId: string): Promise<number> => {
  const log = await forUser(userId).findOne('weight_logs', {
    sort: ['-logged_at'],
    fields: ['weight_kg'],
  });

  return log ? toNumber(log.weight_kg) : BERAT_ACUAN_KG;
};

interface SumberOlahraga {
  workout_name: string;
  calories_burned: number;
}

/**
 * Menentukan nama dan kalori berdasarkan sumber olahraganya.
 *
 * Untuk sumber library dan custom, kalorinya dihitung backend dan nilai
 * calories_burned dari client diabaikan — kalau tidak, client bisa mengarang
 * angka kalori yang tidak sesuai dengan durasi dan berat badannya.
 */
const resolveSumber = async (userId: string, data: CreateWorkoutDto): Promise<SumberOlahraga> => {
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

    return {
      workout_name: item.name,
      calories_burned: caloriesFromWorkout(
        toNumber(item.calories_burned_per_minute),
        data.duration_minutes,
        weightKg,
      ),
    };
  }

  if (data.custom_workout_id) {
    // findById melempar NOT_FOUND kalau custom workout itu milik user lain.
    const [custom, weightKg] = await Promise.all([
      forUser(userId).findById('custom_workouts', data.custom_workout_id),
      beratUntukEstimasi(userId),
    ]);

    return {
      workout_name: custom.name,
      calories_burned: caloriesFromWorkout(
        toNumber(custom.calories_burned_per_minute),
        data.duration_minutes,
        weightKg,
      ),
    };
  }

  // Input manual. Zod sudah memastikan kedua field ini terisi ketika tidak ada
  // sumber yang dirujuk, tapi diperiksa ulang di sini daripada memaksa tipe
  // dengan cast. Kalau aturan validasinya berubah suatu saat, yang muncul
  // adalah error yang jelas, bukan undefined yang diam-diam masuk database.
  const { workout_name: nama, calories_burned: kalori } = data;

  if (nama === undefined || kalori === undefined) {
    throw AppError.badRequest(
      'Olahraga manual butuh workout_name dan calories_burned, atau pilih dari library / custom workout',
    );
  }

  return { workout_name: nama, calories_burned: kalori };
};

export const create = async (userId: string, data: CreateWorkoutDto): Promise<WorkoutLogRecord> => {
  const sumber = await resolveSumber(userId, data);

  const log = await forUser(userId).create('workout_logs', {
    workout_library_id: data.workout_library_id ?? null,
    custom_workout_id: data.custom_workout_id ?? null,
    workout_name: sumber.workout_name,
    duration_minutes: data.duration_minutes,
    calories_burned: sumber.calories_burned,
    intensity: data.intensity,
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
 * Ketika durasinya berubah dan user tidak menyebut kalorinya sendiri, kalori
 * diskalakan proporsional dari nilai lama. Cara ini dipilih daripada menghitung
 * ulang dari library karena berlaku untuk ketiga sumber sekaligus — termasuk
 * olahraga yang diinput manual, yang tidak punya nilai per menit untuk dirujuk.
 *
 * Membiarkan durasi berubah tanpa menyentuh kalori akan meninggalkan angka yang
 * saling bertentangan: lari 20 menit dengan kalori milik sesi 60 menit.
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

  if (data.duration_minutes !== undefined) {
    perubahan.duration_minutes = data.duration_minutes;

    if (data.calories_burned === undefined && log.duration_minutes > 0) {
      perubahan.calories_burned = Math.round(
        (log.calories_burned / log.duration_minutes) * data.duration_minutes,
      );
    }
  }

  // Nilai dari user selalu menang atas hasil penskalaan di atas.
  if (data.calories_burned !== undefined) perubahan.calories_burned = data.calories_burned;

  return repo.update('workout_logs', logId, perubahan);
};

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('workout_logs', logId);
};
