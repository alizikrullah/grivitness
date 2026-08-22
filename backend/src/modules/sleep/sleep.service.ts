import { forUser } from '../../data/scoped.js';
import type { SleepLogRecord } from '../../types/directus-schema.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateSleepDto } from './sleep.validation.js';

/**
 * Sengaja TIDAK ada aturan satu baris per hari — user bisa tidur siang juga.
 * Di summary harian, durasinya dijumlahkan.
 */

/**
 * Tanggal yang dipakai untuk mengelompokkan sesi tidur.
 *
 * Dipakai tanggal saat tidur DIMULAI, bukan saat bangun. Tidur jam 23:00
 * tanggal 22 dan bangun jam 06:00 tanggal 23 tercatat sebagai tidurnya
 * tanggal 22 — kalau memakai waktu bangun, tidur malam justru terhitung di
 * hari berikutnya dan grafik harian jadi bergeser satu hari.
 *
 * Perhitungannya dilakukan dalam WIB, bukan UTC, supaya pengelompokannya
 * sesuai dengan hari yang dirasakan user.
 */
const tanggalMulaiWib = (sleepStart: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date(sleepStart));
};

export const create = async (userId: string, data: CreateSleepDto): Promise<SleepLogRecord> => {
  const mulai = new Date(data.sleep_start).getTime();
  const selesai = new Date(data.sleep_end).getTime();

  // Dihitung backend, bukan diterima dari client, supaya durasinya selalu
  // konsisten dengan kedua timestamp-nya.
  const durationMinutes = Math.round((selesai - mulai) / 60_000);

  const log = await forUser(userId).create('sleep_logs', {
    sleep_start: data.sleep_start,
    sleep_end: data.sleep_end,
    duration_minutes: durationMinutes,
    quality_score: data.quality_score,
    notes: data.notes ?? null,
    logged_at: tanggalMulaiWib(data.sleep_start),
  });

  await recordActivitySafely(userId);

  return log;
};

export interface SleepDay {
  date: string;
  total_minutes: number;
  logs: SleepLogRecord[];
}

export const getByDate = async (userId: string, date: string): Promise<SleepDay> => {
  const repo = forUser(userId);
  const filter = { logged_at: { _eq: date } };

  const [logs, totalMinutes] = await Promise.all([
    repo.list('sleep_logs', { filter, sort: ['sleep_start'], limit: -1 }),
    repo.sum('sleep_logs', 'duration_minutes', filter),
  ]);

  return { date, total_minutes: totalMinutes, logs };
};

export const getToday = async (userId: string): Promise<SleepDay> =>
  getByDate(userId, todayInJakarta());

export const getRange = async (userId: string, range: DateRangeDto): Promise<SleepLogRecord[]> =>
  forUser(userId).list('sleep_logs', {
    filter: dateRangeFilter(range),
    sort: ['logged_at', 'sleep_start'],
    limit: -1,
  });

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('sleep_logs', logId);
};
