import { readItems } from '@directus/sdk';

import { directus } from '../../config/directus.js';
import type { CalorieSource, DistanceKind, WorkoutIntensity } from '../../constants/enums.js';
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
  kcalPerMinuteWithIntensity,
  metFromSpeed,
  netKcalPerMinuteAt70,
} from '../../utils/calories.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { analyzeImages } from '../../utils/groq.js';
import { toNumber } from '../../utils/number.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { toScreenshotBuffer } from '../../utils/sharp.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import { bacaStatusHari, type StatusHari } from './day-status.js';
import {
  normalisasiScan,
  type PilihanLibrary,
  type WorkoutScanResult,
  workoutScanPrompt,
} from './workout-scan.js';
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
  // Baris yang disembunyikan (mis. Lari Cepat setelah digabung jadi Lari)
  // tidak ditawarkan lagi, tapi tetap ada untuk catatan lama yang merujuknya.
  const filter: Record<string, unknown> = {
    _or: [{ hidden: { _eq: false } }, { hidden: { _null: true } }],
  };

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

/** Log olahraga beserta jenis jaraknya (RUN/WALK), diambil dari library. */
export type WorkoutLogWithKind = WorkoutLogRecord & { distance_kind: DistanceKind | null };

/**
 * Peta id library ke jenis jaraknya. Library global dan kecil, jadi satu
 * query cukup untuk menandai sederet log sekaligus.
 */
const petaJenisJarak = async (): Promise<Map<string, DistanceKind>> => {
  const baris = await withRetry(
    () =>
      directus.request(
        readItems('workout_library', {
          filter: { distance_kind: { _nnull: true } },
          fields: ['id', 'distance_kind'],
          limit: -1,
        }),
      ),
    'workout_library.distanceKinds',
  );
  const peta = new Map<string, DistanceKind>();
  for (const b of baris) if (b.distance_kind) peta.set(b.id, b.distance_kind);
  return peta;
};

/**
 * Menandai log dengan jenis jaraknya, supaya client tahu mana yang lari atau
 * jalan (grafik perkembangan, kolom jarak di form) tanpa memuat library.
 */
const denganJenis = async (logs: WorkoutLogRecord[]): Promise<WorkoutLogWithKind[]> => {
  if (logs.length === 0) return [];
  const peta = await petaJenisJarak();
  return logs.map((log) => ({
    ...log,
    distance_kind: log.workout_library_id ? (peta.get(log.workout_library_id) ?? null) : null,
  }));
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
  /** Intensitas yang benar-benar dipakai, null kalau tidak berlaku. */
  intensity: WorkoutIntensity | null;
  /** RUN/WALK kalau olahraganya dari library berjarak. */
  distance_kind: DistanceKind | null;
}

interface UkuranSesi {
  duration_minutes?: number;
  sets?: number;
  reps?: number;
  hold_seconds?: number;
}

/**
 * Durasi detik dari screenshot lebih persis daripada menit: dipakai kalau ada,
 * sebagai menit pecahan. Yang disimpan di duration_minutes tetap dibulatkan.
 */
const ukuranDari = (data: CreateWorkoutDto): UkuranSesi & CreateWorkoutDto => ({
  ...data,
  duration_minutes:
    data.duration_seconds !== undefined ? data.duration_seconds / 60 : data.duration_minutes,
});

/**
 * Kalori lari atau jalan dari KECEPATAN sesungguhnya, kalau jaraknya diketahui.
 *
 * Kecepatan dihitung dari waktu bergerak (pace x jarak) kalau pace ada,
 * kalau tidak dari durasi. Kalorinya juga dari waktu bergerak itu: jeda di
 * tengah sesi sudah termasuk PAR sisa hari. Intensitas tidak dipakai, karena
 * kecepatannya sudah mengukur seberapa keras sesinya.
 */
const kaloriDariKecepatan = (
  jenis: DistanceKind,
  jarakKm: number,
  menit: number,
  paceDetikPerKm: number | null,
  weightKg: number,
): number | null => {
  const menitBergerak = paceDetikPerKm !== null ? (paceDetikPerKm * jarakKm) / 60 : menit;
  if (menitBergerak <= 0 || jarakKm <= 0) return null;
  const kmPerJam = jarakKm / (menitBergerak / 60);
  return caloriesFromWorkout(
    netKcalPerMinuteAt70(metFromSpeed(jenis, kmPerJam)),
    menitBergerak,
    weightKg,
  );
};

/** Pace dari aplikasi kalau ada, kalau tidak durasi dibagi jarak. */
const paceSesi = (
  pace: number | null | undefined,
  jarakKm: number | null | undefined,
  detik: number | null | undefined,
): number | null => {
  if (pace !== undefined && pace !== null) return pace;
  if (jarakKm === undefined || jarakKm === null || jarakKm <= 0) return null;
  if (detik === undefined || detik === null || detik <= 0) return null;
  return Math.round(detik / jarakKm);
};

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
/**
 * Intensitas cuma berarti untuk olahraga berukuran MENIT. Push up dan plank
 * diukur set, dan jeda antar setnya memang sudah tidak dihitung.
 */
const intensitasBerlaku = (
  data: UkuranSesi,
  intensity: WorkoutIntensity | null | undefined,
): WorkoutIntensity | null => (data.duration_minutes !== undefined ? (intensity ?? null) : null);

const resolveSumber = async (
  userId: string,
  data: UkuranSesi & CreateWorkoutDto,
): Promise<SumberOlahraga> => {
  const manual = data.calories_burned;
  const intensitas = intensitasBerlaku(data, data.intensity);

  // Kalorinya dari menit gerak yang PERSIS (bisa pecahan), yang disimpan
  // menitnya dibulatkan. 15 detik push up tersimpan 0 menit tapi kalorinya
  // tetap dihitung dari 15 detik itu.
  const dariMet = (
    kkalPerMenit: string,
    weightKg: number,
    secondsPerRep: number | null,
  ): Omit<SumberOlahraga, 'workout_name' | 'distance_kind'> => {
    const menit = menitGerak(data, secondsPerRep);
    return manual === undefined
      ? {
          calories_burned: caloriesFromWorkout(
            kcalPerMinuteWithIntensity(toNumber(kkalPerMenit), intensitas),
            menit,
            weightKg,
          ),
          calories_source: 'MET',
          duration_minutes: Math.round(menit),
          intensity: intensitas,
        }
      : {
          calories_burned: manual,
          calories_source: 'MANUAL',
          duration_minutes: Math.round(menit),
          intensity: intensitas,
        };
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

    const jenis = item.distance_kind ?? null;
    const menit = menitGerak(data, item.seconds_per_rep);

    // Lari dan jalan yang jaraknya diketahui: MET dari kecepatannya sendiri,
    // bukan dari tebakan "santai" di library.
    if (manual === undefined && jenis !== null && data.distance_km !== undefined) {
      const kalori = kaloriDariKecepatan(
        jenis,
        data.distance_km,
        menit,
        data.pace_seconds_per_km ?? null,
        weightKg,
      );
      if (kalori !== null) {
        return {
          workout_name: item.name,
          calories_burned: kalori,
          calories_source: 'MET',
          duration_minutes: Math.round(menit),
          intensity: null,
          distance_kind: jenis,
        };
      }
    }

    return {
      workout_name: item.name,
      distance_kind: jenis,
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
      distance_kind: null,
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
    intensity: intensitas,
    distance_kind: null,
  };
};

export const create = async (
  userId: string,
  data: CreateWorkoutDto,
): Promise<WorkoutLogWithKind> => {
  const ukuran = ukuranDari(data);
  const sumber = await resolveSumber(userId, ukuran);

  const detik =
    data.duration_seconds ??
    (data.duration_minutes !== undefined ? data.duration_minutes * 60 : undefined);

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
    intensity: sumber.intensity,
    tracked_by_device: data.tracked_by_device ?? false,
    duration_seconds: data.duration_seconds ?? null,
    distance_km: data.distance_km === undefined ? null : data.distance_km.toFixed(2),
    // Pace cuma diturunkan untuk lari dan jalan; renang punya satuannya sendiri.
    pace_seconds_per_km:
      sumber.distance_kind === null
        ? (data.pace_seconds_per_km ?? null)
        : paceSesi(data.pace_seconds_per_km, data.distance_km, detik),
    avg_hr: data.avg_hr ?? null,
    max_hr: data.max_hr ?? null,
    avg_cadence: data.avg_cadence ?? null,
    step_count: data.step_count ?? null,
    elevation_gain_m: data.elevation_gain_m ?? null,
    training_effect: data.training_effect === undefined ? null : data.training_effect.toFixed(1),
    started_at: data.started_at ?? null,
    notes: data.notes ?? null,
    logged_at: data.logged_at ?? todayInJakarta(),
  });

  await recordActivitySafely(userId);

  return { ...log, distance_kind: sumber.distance_kind };
};

/** Sesi satu tanggal beserta status harinya (rest day, sakit, atau biasa). */
export interface WorkoutDay extends StatusHari {
  date: string;
  total_minutes: number;
  total_calories: number;
  logs: WorkoutLogWithKind[];
}

export const getByDate = async (userId: string, date: string): Promise<WorkoutDay> => {
  const repo = forUser(userId);
  const filter = { logged_at: { _eq: date } };

  // Query yang tidak saling bergantung, jadi dijalankan bersamaan.
  const [logs, totalMinutes, totalCalories, status] = await Promise.all([
    repo.list('workout_logs', { filter, sort: ['created_at'], limit: -1 }),
    repo.sum('workout_logs', 'duration_minutes', filter),
    repo.sum('workout_logs', 'calories_burned', filter),
    bacaStatusHari(userId, date),
  ]);

  return {
    date,
    total_minutes: totalMinutes,
    total_calories: totalCalories,
    ...status,
    logs: await denganJenis(logs),
  };
};

export const getToday = async (userId: string): Promise<WorkoutDay> =>
  getByDate(userId, todayInJakarta());

export const getRange = async (
  userId: string,
  range: DateRangeDto,
): Promise<WorkoutLogWithKind[]> =>
  denganJenis(
    await forUser(userId).list('workout_logs', {
      filter: dateRangeFilter(range),
      sort: ['logged_at'],
      limit: -1,
    }),
  );

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
): Promise<WorkoutLogWithKind> => {
  const repo = forUser(userId);

  // findById supaya log milik user lain dibalas 404, bukan ikut terubah.
  const log = await repo.findById('workout_logs', logId);

  const perubahan: Record<string, unknown> = {};

  if (data.workout_name !== undefined) perubahan.workout_name = data.workout_name;
  if (data.notes !== undefined) perubahan.notes = data.notes;
  if (data.tracked_by_device !== undefined) perubahan.tracked_by_device = data.tracked_by_device;

  if (data.load_kg !== undefined) {
    perubahan.load_kg = data.load_kg === null ? null : data.load_kg.toFixed(2);
  }

  // Rincian sesi: disalin apa adanya, null menghapus.
  if (data.avg_hr !== undefined) perubahan.avg_hr = data.avg_hr;
  if (data.max_hr !== undefined) perubahan.max_hr = data.max_hr;
  if (data.avg_cadence !== undefined) perubahan.avg_cadence = data.avg_cadence;
  if (data.step_count !== undefined) perubahan.step_count = data.step_count;
  if (data.elevation_gain_m !== undefined) perubahan.elevation_gain_m = data.elevation_gain_m;
  if (data.started_at !== undefined) perubahan.started_at = data.started_at;
  if (data.training_effect !== undefined) {
    perubahan.training_effect =
      data.training_effect === null ? null : data.training_effect.toFixed(1);
  }
  if (data.distance_km !== undefined) {
    perubahan.distance_km = data.distance_km === null ? null : data.distance_km.toFixed(2);
  }
  if (data.pace_seconds_per_km !== undefined) {
    perubahan.pace_seconds_per_km = data.pace_seconds_per_km;
  }

  // Durasi detik menggantikan durasi menit: menitnya diturunkan dari situ.
  const menitDiminta =
    data.duration_seconds !== undefined ? data.duration_seconds / 60 : data.duration_minutes;
  if (data.duration_seconds !== undefined) perubahan.duration_seconds = data.duration_seconds;
  // Menit yang diketik ulang tanpa detik membuat detik lama basi.
  else if (data.duration_minutes !== undefined) perubahan.duration_seconds = null;

  const ukuranBerubah =
    menitDiminta !== undefined ||
    data.sets !== undefined ||
    data.reps !== undefined ||
    data.hold_seconds !== undefined;

  // Intensitas yang berubah juga mengubah kalori MET, walau ukurannya sama.
  const intensitasBerubah = data.intensity !== undefined && data.intensity !== log.intensity;

  // Jarak atau pace yang berubah mengubah kecepatan, jadi juga kalori MET lari.
  const jarakBerubah = data.distance_km !== undefined || data.pace_seconds_per_km !== undefined;

  const jarakBaru =
    data.distance_km !== undefined
      ? data.distance_km
      : log.distance_km === null
        ? null
        : toNumber(log.distance_km);

  const library = await barisLibrary(log);
  const jenis = library?.distance_kind ?? null;

  // Pace yang tidak dikirim diturunkan ulang kalau jarak atau durasinya
  // berubah, supaya tidak tertinggal angka sesi sebelum dikoreksi.
  if (jenis !== null && data.pace_seconds_per_km === undefined && (jarakBerubah || ukuranBerubah)) {
    const detik =
      data.duration_seconds ??
      (data.duration_minutes !== undefined
        ? data.duration_minutes * 60
        : (log.duration_seconds ?? log.duration_minutes * 60));
    perubahan.pace_seconds_per_km = paceSesi(null, jarakBaru, detik);
  }

  if (ukuranBerubah || intensitasBerubah || jarakBerubah) {
    // Ukuran baru digabung dengan yang tersimpan: mengubah set saja tidak
    // boleh menghilangkan ulangannya. Menit yang dikirim user menang; kalau
    // set/ulangan yang dikirim, menitnya diturunkan ulang. Kalau yang berubah
    // cuma intensitas, ukuran yang tersimpan dipakai apa adanya.
    const ukuran: UkuranSesi = !ukuranBerubah
      ? log.sets === null
        ? { duration_minutes: log.duration_minutes }
        : {
            sets: log.sets,
            reps: log.reps ?? undefined,
            hold_seconds: log.hold_seconds ?? undefined,
          }
      : menitDiminta !== undefined
        ? { duration_minutes: menitDiminta }
        : {
            sets: data.sets ?? log.sets ?? 1,
            reps:
              data.reps ?? (data.hold_seconds !== undefined ? undefined : (log.reps ?? undefined)),
            hold_seconds:
              data.hold_seconds ??
              (data.reps !== undefined ? undefined : (log.hold_seconds ?? undefined)),
          };

    // Lari dan jalan berjarak dihitung dari kecepatan; intensitas tidak berlaku.
    const pakaiKecepatan = jenis !== null && jarakBaru !== null && jarakBaru > 0;
    const intensitas = pakaiKecepatan
      ? null
      : intensitasBerlaku(ukuran, data.intensity ?? log.intensity);
    perubahan.intensity = intensitas;

    const secondsPerRep = library?.seconds_per_rep ?? null;
    const menit = menitGerak(ukuran, secondsPerRep);

    perubahan.duration_minutes = Math.round(menit);
    perubahan.sets = ukuran.sets ?? null;
    perubahan.reps = ukuran.reps ?? null;
    perubahan.hold_seconds = ukuran.hold_seconds ?? null;

    // Baris lama dari sebelum kolom asalnya ada bernilai null. Semuanya dulu
    // dihitung dari MET (angka client diabaikan), jadi null diperlakukan MET.
    const dariMet = log.calories_source !== 'MANUAL';

    const paceBaru =
      perubahan.pace_seconds_per_km !== undefined
        ? (perubahan.pace_seconds_per_km as number | null)
        : log.pace_seconds_per_km;
    const kaloriKecepatan =
      pakaiKecepatan && jenis !== null && jarakBaru !== null
        ? kaloriDariKecepatan(jenis, jarakBaru, menit, paceBaru, await beratUntukEstimasi(userId))
        : null;

    if (data.calories_burned === undefined && dariMet && kaloriKecepatan !== null) {
      perubahan.calories_burned = kaloriKecepatan;
    } else if (data.calories_burned === undefined && dariMet) {
      const kkalPerMenit = await kkalPerMenitSumber(userId, log);
      if (kkalPerMenit !== null) {
        perubahan.calories_burned = caloriesFromWorkout(
          kcalPerMinuteWithIntensity(kkalPerMenit, intensitas),
          menit,
          await beratUntukEstimasi(userId),
        );
      } else if (ukuranBerubah && log.duration_minutes > 0) {
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

  const hasil = await repo.update('workout_logs', logId, perubahan);
  return { ...hasil, distance_kind: jenis };
};

/** Pilihan library untuk model scan, urut nama, tanpa yang disembunyikan. */
const pilihanLibrary = async (): Promise<PilihanLibrary[]> =>
  (await getLibrary({})).map((item) => ({
    id: item.id,
    name: item.name,
    measure: item.measure ?? 'TIME',
    distance_kind: item.distance_kind ?? null,
  }));

/**
 * Membaca screenshot aplikasi jam atau aplikasi lari jadi isian form
 * olahraga. TIDAK menyimpan apa pun, gambarnya juga tidak: hasilnya mengisi
 * form, user memeriksa lalu menekan Simpan lewat POST /api/workouts biasa.
 */
export const scan = async (userId: string, files: Buffer[]): Promise<WorkoutScanResult> => {
  if (files.length === 0) throw AppError.badRequest('Pilih minimal satu screenshot');
  if (files.length > 3) throw AppError.badRequest('Maksimal 3 screenshot sekaligus');

  const [gambar, pilihan, metrics] = await Promise.all([
    Promise.all(files.map((file) => toScreenshotBuffer(file))),
    pilihanLibrary(),
    loadUserMetrics(userId),
  ]);

  const hariIni = todayInJakarta();
  const raw = await analyzeImages(gambar, workoutScanPrompt(pilihan, hariIni));

  return normalisasiScan(raw, pilihan, hariIni, metrics.bmr);
};

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('workout_logs', logId);
};
