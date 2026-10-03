import { forUser } from '../../data/scoped.js';
import type { SleepLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { sleepDay, todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateSleepDto, UpdateSleepDto } from './sleep.validation.js';

/**
 * Sengaja TIDAK ada aturan satu baris per hari, user bisa tidur siang juga.
 * Di summary harian, durasinya dijumlahkan.
 */

/**
 * Tanggal yang dipakai untuk mengelompokkan sesi tidur: `sleepDay()`.
 *
 * Tidur tanggal X adalah semua sesi yang MULAI antara jam 18:00 tanggal X-1
 * dan jam 18:00 tanggal X. Tidur 23:00 tanggal 22 dan bangun 06:30 tanggal 23
 * tetap tercatat di tanggal 23, seperti cara orang membicarakan tidurnya:
 * bangun pagi ini, yang dicari "tidur saya semalam" di bawah hari ini.
 *
 * Dulu yang dipakai tanggal BANGUN tiap sesi, dan itu memecah malam yang
 * terpotong. Tidur 21:00, kebangun 23:00, tidur lagi 02:00 sampai 04:20:
 * potongan pertama bangun sebelum tengah malam, jadi jatuh ke tanggal lain
 * dari potongan keduanya. Lihat catatan di `utils/daily-key.ts`.
 *
 * Tidur siang tidak terpengaruh: mulainya sebelum jam 18:00.
 */

/**
 * Kelonggaran untuk jam bangun di masa depan. Jam dipilih per menit, dan
 * menyimpan beberapa menit sesudah bangun tidak boleh tertolak.
 */
const KELONGGARAN_MASA_DEPAN_MS = 5 * 60_000;

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
 *
 * Catatan: "tabrakan" 29 ke 30 Sep 2026 (21.00 sampai 23.00 lawan 22.30
 * sampai 04.20) BUKAN entri ganda. Potongan 21.00 sampai 23.00 itu milik
 * malam 28, tapi form lama menaruhnya di malam 29. Itu yang dibetulkan aturan
 * jam 18:00 dan `tolakMasaDepan()`; penjaga ini tetap untuk entri yang
 * memang dobel.
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

/**
 * Menolak jam bangun yang belum terjadi.
 *
 * Tidur dicatat sesudah terjadi, jadi jam bangun di masa depan hampir pasti
 * tanggal yang salah. Kasus nyatanya: potongan 21.00 sampai 23.00 malam 28
 * Sep disimpan jam 19.50 tanggal 29 sebagai malam 29, yang saat itu belum
 * terjadi. Penjaga ini akan menolaknya di tempat.
 */
const tolakMasaDepan = (selesai: string): void => {
  const akhir = new Date(selesai);

  if (akhir.getTime() > Date.now() + KELONGGARAN_MASA_DEPAN_MS) {
    throw AppError.badRequest(
      `Jam bangun ${jamWIB.format(akhir)} tanggal ${tanggalWIB.format(akhir)} belum terjadi. Cek lagi tanggal dan jamnya.`,
    );
  }
};

export const create = async (userId: string, data: CreateSleepDto): Promise<SleepLogRecord> => {
  const mulai = new Date(data.sleep_start).getTime();
  const selesai = new Date(data.sleep_end).getTime();

  tolakMasaDepan(data.sleep_end);
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
    logged_at: sleepDay(data.sleep_start),
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

  // Hanya kalau jamnya diubah: koreksi skor kualitas di baris lama tidak
  // boleh tertahan oleh aturan yang lebih baru dari barisnya.
  if (data.sleep_start !== undefined || data.sleep_end !== undefined) {
    tolakMasaDepan(selesai);
  }

  await tolakTabrakan(userId, mulai, selesai, logId);

  return repo.update('sleep_logs', logId, {
    sleep_start: mulai,
    sleep_end: selesai,
    duration_minutes: durasiMenit,
    logged_at: sleepDay(mulai),
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
