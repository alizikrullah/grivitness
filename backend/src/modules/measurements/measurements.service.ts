import { forUser } from '../../data/scoped.js';
import type { BodyMeasurementRecord } from '../../types/directus-schema.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateMeasurementDto, UpdateMeasurementDto } from './measurements.validation.js';

/**
 * Menyimpan lingkar pinggang hari itu, menimpa kalau sudah ada.
 *
 * Sengaja upsert. Ini pengukuran 2-4 minggu sekali yang dilakukan bersama
 * foto badan, dan salah baca pita lalu mengukur ulang itu wajar. Memaksa user
 * menghapus dulu baru mencatat ulang cuma menambah langkah.
 */
export const create = async (
  userId: string,
  data: CreateMeasurementDto,
): Promise<BodyMeasurementRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();
  const repo = forUser(userId);

  const adaSebelumnya = await repo.findOne('body_measurements', {
    filter: { logged_at: { _eq: loggedAt } },
  });

  const log = adaSebelumnya
    ? await repo.update('body_measurements', adaSebelumnya.id, { waist_cm: data.waist_cm })
    : await repo.create('body_measurements', {
        waist_cm: data.waist_cm,
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
