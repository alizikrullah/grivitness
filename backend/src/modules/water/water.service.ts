import { forUser } from '../../data/scoped.js';
import type { WaterLogRecord } from '../../types/directus-schema.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, timestampDayFilter, timestampRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateWaterDto, UpdateWaterDto } from './water.validation.js';

export interface WaterDay {
  date: string;
  total_ml: number;
  logs: WaterLogRecord[];
}

export const create = async (userId: string, data: CreateWaterDto): Promise<WaterLogRecord> => {
  const log = await forUser(userId).create('water_logs', {
    amount_ml: data.amount_ml,
    logged_at: data.logged_at ?? new Date().toISOString(),
  });

  await recordActivitySafely(userId);

  return log;
};

/**
 * Log air untuk satu tanggal beserta totalnya.
 *
 * Total dihitung Postgres lewat agregasi, bukan dengan menjumlahkan array di
 * Node. Untuk sehari bedanya belum terasa, tapi polanya sama dengan yang
 * dipakai module summary di mana selisihnya jadi nyata.
 */
export const getByDate = async (userId: string, date: string): Promise<WaterDay> => {
  const repo = forUser(userId);
  const filter = timestampDayFilter(date);

  const [logs, totalMl] = await Promise.all([
    repo.list('water_logs', { filter, sort: ['logged_at'], limit: -1 }),
    repo.sum('water_logs', 'amount_ml', filter),
  ]);

  return { date, total_ml: totalMl, logs };
};

export const getToday = async (userId: string): Promise<WaterDay> =>
  getByDate(userId, todayInJakarta());

export const getRange = async (userId: string, range: DateRangeDto): Promise<WaterLogRecord[]> =>
  forUser(userId).list('water_logs', {
    filter: timestampRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('water_logs', logId);
};

/** Mengoreksi jumlah air yang sudah tercatat, tanpa perlu hapus lalu catat ulang. */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateWaterDto,
): Promise<WaterLogRecord> => {
  const repo = forUser(userId);

  // findById supaya log milik user lain dibalas 404, bukan ikut terubah.
  await repo.findById('water_logs', logId);

  return repo.update('water_logs', logId, data);
};
