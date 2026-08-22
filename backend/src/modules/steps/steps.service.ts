import { forUser } from '../../data/scoped.js';
import type { StepLogRecord } from '../../types/directus-schema.js';
import { caloriesFromSteps, distanceFromSteps } from '../../utils/calories.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { toNumber } from '../../utils/number.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import type { CreateStepsDto, UpdateStepsDto } from './steps.validation.js';

/**
 * Berat badan yang dipakai untuk mengestimasi kalori.
 *
 * Kalau user belum pernah menimbang, dipakai 70kg — angka acuan yang sama
 * dengan yang dipakai workout_library. Estimasinya jadi kasar, tapi tetap
 * memberi angka yang masuk akal alih-alih menolak mencatat langkah hanya
 * karena berat badan belum diisi.
 */
const BERAT_ACUAN_KG = 70;

const beratUntukEstimasi = async (userId: string): Promise<number> => {
  const log = await forUser(userId).findOne('weight_logs', {
    sort: ['-logged_at'],
    fields: ['weight_kg'],
  });

  return log ? toNumber(log.weight_kg) : BERAT_ACUAN_KG;
};

/** Menghitung turunan dari jumlah langkah: jarak tempuh dan kalori terbakar. */
const turunan = (steps: number, weightKg: number) => ({
  distance_km: distanceFromSteps(steps).toFixed(3),
  calories_burned: caloriesFromSteps(steps, weightKg),
});

export const create = async (userId: string, data: CreateStepsDto): Promise<StepLogRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();
  const weightKg = await beratUntukEstimasi(userId);

  return forUser(userId).create('step_logs', {
    steps: data.steps,
    ...turunan(data.steps, weightKg),
    logged_at: loggedAt,
    user_date_key: dailyKey(userId, loggedAt),
  });
};

export const getToday = async (userId: string): Promise<StepLogRecord | null> =>
  forUser(userId).findOne('step_logs', {
    filter: { logged_at: { _eq: todayInJakarta() } },
  });

export const getRange = async (userId: string, range: DateRangeDto): Promise<StepLogRecord[]> =>
  forUser(userId).list('step_logs', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

/**
 * Mengubah jumlah langkah.
 *
 * Jarak dan kalori ikut dihitung ulang. Kalau tidak, angka di database jadi
 * bertentangan satu sama lain — langkahnya berubah tapi kalorinya tetap.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateStepsDto,
): Promise<StepLogRecord> => {
  const repo = forUser(userId);

  await repo.findById('step_logs', logId);

  const weightKg = await beratUntukEstimasi(userId);

  return repo.update('step_logs', logId, {
    steps: data.steps,
    ...turunan(data.steps, weightKg),
  });
};
