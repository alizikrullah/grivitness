import { forUser } from '../../data/scoped.js';
import type { SleepLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateSleepDto, UpdateSleepDto } from './sleep.validation.js';

/**
 * Sengaja TIDAK ada aturan satu baris per hari, user bisa tidur siang juga.
 * Di summary harian, durasinya dijumlahkan.
 */

/**
 * Tanggal yang dipakai untuk mengelompokkan sesi tidur.
 *
 * Dipakai tanggal saat BANGUN, bukan saat mulai tidur. Tidur jam 23:00 tanggal
 * 22 dan bangun jam 06:30 tanggal 23 tercatat sebagai tidurnya tanggal 23.
 *
 * Ini mengikuti cara orang membicarakan tidurnya: bangun pagi ini lalu membuka
 * aplikasi, yang dicari adalah "tidur saya semalam" di bawah hari ini. Dengan
 * pengelompokan menurut waktu mulai, catatan itu jatuh ke kemarin dan layar
 * "Tidur hari ini" tampak kosong padahal datanya sudah tersimpan, persis
 * seperti gagal menyimpan.
 *
 * Tidur siang tidak terpengaruh: mulai dan bangunnya di hari yang sama.
 *
 * Perhitungannya dilakukan dalam WIB, bukan UTC, supaya pengelompokannya
 * sesuai dengan hari yang dirasakan user.
 */
const tanggalBangunWib = (sleepEnd: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date(sleepEnd));
};

const jamWIB = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const tanggalWIB = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'short',
});

/**
 * Menolak sesi tidur yang waktunya bertabrakan dengan sesi lain milik user.
 *
 * Dua sesi bertabrakan kalau yang satu mulai sebelum yang lain selesai DAN
 * selesai setelah yang lain mulai. Bersentuhan persis (bangun 06.00, tidur
 * lagi 06.00) bukan tabrakan. Tanpa penjaga ini, entri ganda menjumlahkan jam
 * yang sama dua kali: tidur terbaca lebih lama, dan PAL hari itu ikut turun.
 * Kasus nyatanya 29 ke 30 Sep 2026: 21.00 sampai 23.00 dan 22.30 sampai 04.20.
 */
const tolakTabrakan = async (
  userId: string,
  mulai: string,
  selesai: string,
  kecuali?: string,
): Promise<void> => {
  const tabrakan = await forUser(userId).findOne('sleep_logs', {
    filter: {
      sleep_start: { _lt: selesai },
      sleep_end: { _gt: mulai },
      ...(kecuali === undefined ? {} : { id: { _neq: kecuali } }),
    },
    sort: ['sleep_start'],
  });

  if (tabrakan) {
    const awal = new Date(tabrakan.sleep_start);
    const akhir = new Date(tabrakan.sleep_end);
    throw AppError.duplicate(
      `Waktunya bertabrakan dengan tidur ${jamWIB.format(awal)} sampai ${jamWIB.format(akhir)} (${tanggalWIB.format(akhir)}) yang sudah tercatat. Ubah atau hapus catatan itu dulu.`,
    );
  }
};

export const create = async (userId: string, data: CreateSleepDto): Promise<SleepLogRecord> => {
  const mulai = new Date(data.sleep_start).getTime();
  const selesai = new Date(data.sleep_end).getTime();

  await tolakTabrakan(userId, data.sleep_start, data.sleep_end);

  // Dihitung backend, bukan diterima dari client, supaya durasinya selalu
  // konsisten dengan kedua timestamp-nya.
  const durationMinutes = Math.round((selesai - mulai) / 60_000);

  const log = await forUser(userId).create('sleep_logs', {
    sleep_start: data.sleep_start,
    sleep_end: data.sleep_end,
    duration_minutes: durationMinutes,
    quality_score: data.quality_score,
    notes: data.notes ?? null,
    logged_at: tanggalBangunWib(data.sleep_end),
  });

  await recordActivitySafely(userId);

  return log;
};

/**
 * Mengubah sesi tidur yang sudah tercatat.
 *
 * Durasi dan logged_at TIDAK diterima dari client, keduanya diturunkan ulang
 * dari pasangan waktu yang berlaku setelah perubahan. Kalau client boleh
 * mengirimnya sendiri, satu koreksi jam saja bisa meninggalkan durasi yang
 * tidak lagi cocok dengan waktunya.
 */
export const update = async (
  userId: string,
  logId: string,
  data: UpdateSleepDto,
): Promise<SleepLogRecord> => {
  const repo = forUser(userId);

  // findById supaya sesi milik user lain dibalas 404, bukan ikut terubah.
  const log = await repo.findById('sleep_logs', logId);

  const mulai = data.sleep_start ?? log.sleep_start;
  const selesai = data.sleep_end ?? log.sleep_end;

  const durasiMenit = Math.round(
    (new Date(selesai).getTime() - new Date(mulai).getTime()) / 60_000,
  );

  if (durasiMenit <= 0) {
    throw AppError.badRequest('Waktu bangun harus setelah waktu tidur');
  }

  if (durasiMenit > 24 * 60) {
    throw AppError.badRequest('Durasi tidur maksimal 24 jam');
  }

  await tolakTabrakan(userId, mulai, selesai, logId);

  return repo.update('sleep_logs', logId, {
    sleep_start: mulai,
    sleep_end: selesai,
    duration_minutes: durasiMenit,
    logged_at: tanggalBangunWib(selesai),
    ...(data.quality_score !== undefined ? { quality_score: data.quality_score } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
  });
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
