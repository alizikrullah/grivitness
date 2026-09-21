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
import {
  DETIK_PER_ULANGAN_BAWAAN,
  activeMinutesFromHold,
  activeMinutesFromReps,
  caloriesFromWorkout,
} from '../../utils/calories.js';
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
    measure: data.measure ?? 'TIME',
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
  /** Menit gerak yang disimpan; untuk REPS/HOLD turunan, bisa nol. */
  duration_minutes: number;
}

interface UkuranSesi {
  duration_minutes?: number;
  sets?: number;
  reps?: number;
  hold_seconds?: number;
}

/**
 * Menit gerak sebuah sesi. Menit dari user kalau ada; kalau tidak, diturunkan
 * dari set x ulangan x detik per ulangan (REPS) atau set x detik tahan (HOLD).
 * Validasi sudah menjamin salah satunya terisi.
 */
const menitGerak = (data: UkuranSesi, secondsPerRep: number | null): number => {
  if (data.duration_minutes !== undefined) return data.duration_minutes;
  const sets = data.sets ?? 1;
  if (data.reps !== undefined) {
    return activeMinutesFromReps(sets, data.reps, secondsPerRep ?? DETIK_PER_ULANGAN_BAWAAN);
  }
  if (data.hold_seconds !== undefined) return activeMinutesFromHold(sets, data.hold_seconds);
  return 0;
};

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

  // Kalorinya dari menit gerak yang PERSIS (bisa pecahan), yang disimpan
  // menitnya dibulatkan. 15 detik push up tersimpan 0 menit tapi kalorinya
  // tetap dihitung dari 15 detik itu.
  const dariMet = (
    kkalPerMenit: string,
    weightKg: number,
    secondsPerRep: number | null,
  ): Omit<SumberOlahraga, 'workout_name'> => {
    const menit = menitGerak(data, secondsPerRep);
    return manual === undefined
      ? {
          calories_burned: caloriesFromWorkout(toNumber(kkalPerMenit), menit, weightKg),
          calories_source: 'MET',
          duration_minutes: Math.round(menit),
        }
      : { calories_burned: manual, calories_source: 'MANUAL', duration_minutes: Math.round(menit) };
  };

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
      ...dariMet(item.calories_burned_per_minute, weightKg, item.seconds_per_rep),
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
      ...dariMet(custom.calories_burned_per_minute, weightKg, null),
    };
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

  return {
    workout_name: nama,
    calories_burned: manual,
    calories_source: 'MANUAL',
    duration_minutes: Math.round(menitGerak(data, null)),
  };
};

export const create = async (userId: string, data: CreateWorkoutDto): Promise<WorkoutLogRecord> => {
  const sumber = await resolveSumber(userId, data);

  const log = await forUser(userId).create('workout_logs', {
    workout_library_id: data.workout_library_id ?? null,
    custom_workout_id: data.custom_workout_id ?? null,
    workout_name: sumber.workout_name,
    duration_minutes: sumber.duration_minutes,
    // Set bawaan 1 begitu ada ulangan atau detik tahan: "push up 5 kali"
    // adalah satu set, dan null di sini akan tampil sebagai data yang hilang.
    sets: data.sets ?? (data.reps !== undefined || data.hold_seconds !== undefined ? 1 : null),
    reps: data.reps ?? null,
    hold_seconds: data.hold_seconds ?? null,
    load_kg: data.load_kg === undefined ? null : data.load_kg.toFixed(2),
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
/** Baris library yang dirujuk sebuah log, null kalau log itu manual atau barisnya sudah hilang. */
const barisLibrary = async (log: WorkoutLogRecord): Promise<WorkoutLibraryRecord | null> => {
  const libraryId = log.workout_library_id;
  if (!libraryId) return null;
  const rows = await withRetry(
    () =>
      directus.request(
        readItems('workout_library', {
          filter: { id: { _eq: libraryId } },
          limit: 1,
        }),
      ),
    'workout_library.findById',
  );
  return rows[0] ?? null;
};

const detikPerUlangan = async (log: WorkoutLogRecord): Promise<number | null> =>
  (await barisLibrary(log))?.seconds_per_rep ?? null;

/** kkal/menit @70 kg dari sumber log (library atau custom), null kalau manual. */
const kkalPerMenitSumber = async (
  userId: string,
  log: WorkoutLogRecord,
): Promise<number | null> => {
  const lib = await barisLibrary(log);
  if (lib) return toNumber(lib.calories_burned_per_minute);
  if (log.custom_workout_id) {
    const custom = await forUser(userId).findOne('custom_workouts', {
      filter: { id: { _eq: log.custom_workout_id } },
    });
    return custom ? toNumber(custom.calories_burned_per_minute) : null;
  }
  return null;
};

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

  if (data.load_kg !== undefined) {
    perubahan.load_kg = data.load_kg === null ? null : data.load_kg.toFixed(2);
  }

  const ukuranBerubah =
    data.duration_minutes !== undefined ||
    data.sets !== undefined ||
    data.reps !== undefined ||
    data.hold_seconds !== undefined;

  if (ukuranBerubah) {
    // Ukuran baru digabung dengan yang tersimpan: mengubah set saja tidak
    // boleh menghilangkan ulangannya. Menit yang dikirim user menang; kalau
    // set/ulangan yang dikirim, menitnya diturunkan ulang.
    const ukuran: UkuranSesi =
      data.duration_minutes !== undefined
        ? { duration_minutes: data.duration_minutes }
        : {
            sets: data.sets ?? log.sets ?? 1,
            reps:
              data.reps ?? (data.hold_seconds !== undefined ? undefined : (log.reps ?? undefined)),
            hold_seconds:
              data.hold_seconds ??
              (data.reps !== undefined ? undefined : (log.hold_seconds ?? undefined)),
          };

    const secondsPerRep = await detikPerUlangan(log);
    const menit = menitGerak(ukuran, secondsPerRep);

    perubahan.duration_minutes = Math.round(menit);
    perubahan.sets = ukuran.sets ?? null;
    perubahan.reps = ukuran.reps ?? null;
    perubahan.hold_seconds = ukuran.hold_seconds ?? null;

    // Baris lama dari sebelum kolom asalnya ada bernilai null. Semuanya dulu
    // dihitung dari MET (angka client diabaikan), jadi null diperlakukan MET.
    const dariMet = log.calories_source !== 'MANUAL';

    if (data.calories_burned === undefined && dariMet) {
      const kkalPerMenit = await kkalPerMenitSumber(userId, log);
      if (kkalPerMenit !== null) {
        perubahan.calories_burned = caloriesFromWorkout(
          kkalPerMenit,
          menit,
          await beratUntukEstimasi(userId),
        );
      } else if (log.duration_minutes > 0) {
        // Sumbernya sudah tidak ada (library dihapus): skala dari yang tersimpan.
        perubahan.calories_burned = Math.round(
          (log.calories_burned / log.duration_minutes) * menit,
        );
      }
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
