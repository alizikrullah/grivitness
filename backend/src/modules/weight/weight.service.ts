import { forUser } from '../../data/scoped.js';
import type { WeightLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { toNumber } from '../../utils/number.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import type { CreateWeightDto, UpdateWeightDto } from './weight.validation.js';

/** Log berat ditambah selisih terhadap catatan sebelumnya. */
export interface WeightLogWithTrend extends WeightLogRecord {
  /** Selisih kg dari log sebelumnya. Null untuk log pertama. */
  change_kg: number | null;
}

/**
 * Menghitung selisih antar log berurutan.
 * Data harus sudah terurut dari yang paling lama ke yang paling baru.
 */
const withTrend = (logs: WeightLogRecord[]): WeightLogWithTrend[] =>
  logs.map((log, index) => {
    const sebelumnya = logs[index - 1];

    return {
      ...log,
      change_kg: sebelumnya
        ? Number((toNumber(log.weight_kg) - toNumber(sebelumnya.weight_kg)).toFixed(2))
        : null,
    };
  });

export const create = async (userId: string, data: CreateWeightDto): Promise<WeightLogRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();

  // user_date_key WAJIB diisi. Inilah yang membuat aturan satu log per hari
  // dijamin database, bukan sekadar pengecekan aplikasi yang bisa kena race
  // condition saat dua request datang bersamaan. Lihat CLAUDE.md section 13.
  return forUser(userId).create('weight_logs', {
    weight_kg: data.weight_kg,
    logged_at: loggedAt,
    user_date_key: dailyKey(userId, loggedAt),
    notes: data.notes ?? null,
  });
};

export const getToday = async (userId: string): Promise<WeightLogRecord | null> =>
  forUser(userId).findOne('weight_logs', {
    filter: { logged_at: { _eq: todayInJakarta() } },
  });

export const getRange = async (
  userId: string,
  range: DateRangeDto,
): Promise<WeightLogWithTrend[]> => {
  const logs = await forUser(userId).list('weight_logs', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

  return withTrend(logs);
};

export const update = async (
  userId: string,
  logId: string,
  data: UpdateWeightDto,
): Promise<WeightLogRecord> => {
  const repo = forUser(userId);

  // Melempar NOT_FOUND kalau log ini bukan milik user tersebut.
  await repo.findById('weight_logs', logId);

  return repo.update('weight_logs', logId, data);
};

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('weight_logs', logId);
};

/** Berat terakhir yang tercatat. Dipakai module lain untuk kalkulasi kalori. */
export const latestWeightKg = async (userId: string): Promise<number> => {
  const log = await forUser(userId).findOne('weight_logs', {
    sort: ['-logged_at'],
    fields: ['weight_kg'],
  });

  if (!log) {
    throw AppError.badRequest('Belum ada catatan berat badan. Catat dulu lewat POST /api/weight');
  }

  return toNumber(log.weight_kg);
};
