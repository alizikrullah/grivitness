import { forUser } from '../../data/scoped.js';
import type { MoodLogRecord } from '../../types/directus-schema.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import type { CreateMoodDto, UpdateMoodDto } from './mood.validation.js';

export const create = async (userId: string, data: CreateMoodDto): Promise<MoodLogRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();

  return forUser(userId).create('mood_logs', {
    mood_score: data.mood_score,
    energy_score: data.energy_score,
    notes: data.notes ?? null,
    logged_at: loggedAt,
    user_date_key: dailyKey(userId, loggedAt),
  });
};

export const getToday = async (userId: string): Promise<MoodLogRecord | null> =>
  forUser(userId).findOne('mood_logs', {
    filter: { logged_at: { _eq: todayInJakarta() } },
  });

export const getRange = async (userId: string, range: DateRangeDto): Promise<MoodLogRecord[]> =>
  forUser(userId).list('mood_logs', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

export const update = async (
  userId: string,
  logId: string,
  data: UpdateMoodDto,
): Promise<MoodLogRecord> => {
  const repo = forUser(userId);

  await repo.findById('mood_logs', logId);

  return repo.update('mood_logs', logId, data);
};
