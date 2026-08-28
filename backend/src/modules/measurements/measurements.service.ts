import { forUser } from '../../data/scoped.js';
import type { BodyMeasurementRecord } from '../../types/directus-schema.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateMeasurementDto, UpdateMeasurementDto } from './measurements.validation.js';

export const create = async (
  userId: string,
  data: CreateMeasurementDto,
): Promise<BodyMeasurementRecord> => {
  const { logged_at: loggedAtInput, ...ukuran } = data;
  const loggedAt = loggedAtInput ?? todayInJakarta();

  const log = await forUser(userId).create('body_measurements', {
    ...ukuran,
    logged_at: loggedAt,
    user_date_key: dailyKey(userId, loggedAt),
  });

  await recordActivitySafely(userId);

  return log;
};

/** Pengukuran pada satu tanggal, atau null kalau hari itu tidak diukur. */
export const getByDate = async (
  userId: string,
  date: string,
): Promise<BodyMeasurementRecord | null> =>
  forUser(userId).findOne('body_measurements', {
    filter: { logged_at: { _eq: date } },
  });

/** Pencatatan terakhir, atau null kalau user belum pernah mengukur. */
export const getLatest = async (userId: string): Promise<BodyMeasurementRecord | null> =>
  forUser(userId).findOne('body_measurements', { sort: ['-logged_at'] });

export const getRange = async (
  userId: string,
  range: DateRangeDto,
): Promise<BodyMeasurementRecord[]> =>
  forUser(userId).list('body_measurements', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

export const update = async (
  userId: string,
  logId: string,
  data: UpdateMeasurementDto,
): Promise<BodyMeasurementRecord> => {
  const repo = forUser(userId);

  await repo.findById('body_measurements', logId);

  return repo.update('body_measurements', logId, data);
};

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('body_measurements', logId);
};
