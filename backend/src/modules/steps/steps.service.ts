import { loadUserMetrics, type UserMetrics } from '../../data/user-metrics.js';
import { forUser } from '../../data/scoped.js';
import type { StepLogRecord } from '../../types/directus-schema.js';
import { caloriesFromSteps, distanceFromSteps } from '../../utils/calories.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateStepsDto, UpdateStepsDto } from './steps.validation.js';

/**
 * Menghitung turunan dari jumlah langkah: jarak tempuh dan kalori terbakar.
 *
 * Jaraknya sekarang diturunkan dari tinggi badan, bukan lagi asumsi 80cm per
 * langkah untuk semua orang, asumsi itu melebihkan jarak sekitar 10% pada
 * tinggi rata-rata dan makin meleset untuk yang bertubuh kecil.
 *
 * Kalorinya BERSIH, di atas metabolisme istirahat. Yang istirahat sudah
 * ditanggung TDEE, jadi menghitungnya kotor di sini berarti membayar jam yang
 * sama dua kali.
 */
const turunan = (steps: number, m: UserMetrics) => ({
  distance_km: distanceFromSteps(steps, m.heightCm, m.gender).toFixed(3),
  calories_burned: caloriesFromSteps(steps, m.weightKg),
});

export const create = async (userId: string, data: CreateStepsDto): Promise<StepLogRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();
  const metrics = await loadUserMetrics(userId);

  const log = await forUser(userId).create('step_logs', {
    steps: data.steps,
    ...turunan(data.steps, metrics),
    logged_at: loggedAt,
    user_date_key: dailyKey(userId, loggedAt),
  });

  await recordActivitySafely(userId);

  return log;
};

export const getByDate = async (userId: string, date: string): Promise<StepLogRecord | null> =>
  forUser(userId).findOne('step_logs', {
    filter: { logged_at: { _eq: date } },
  });

export const getToday = async (userId: string): Promise<StepLogRecord | null> =>
  getByDate(userId, todayInJakarta());

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
 * bertentangan satu sama lain, langkahnya berubah tapi kalorinya tetap.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateStepsDto,
): Promise<StepLogRecord> => {
  const repo = forUser(userId);

  await repo.findById('step_logs', logId);

  const metrics = await loadUserMetrics(userId);

  return repo.update('step_logs', logId, {
    steps: data.steps,
    ...turunan(data.steps, metrics),
  });
};

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('step_logs', logId);
};
