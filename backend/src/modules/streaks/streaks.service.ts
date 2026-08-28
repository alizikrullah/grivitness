import { forUser } from '../../data/scoped.js';
import type { StreakRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { logger } from '../../utils/logger.js';

/**
 * Logika streak sesuai CLAUDE.md section 14.
 *
 * Barisnya sudah dibuat saat register, jadi module ini tidak perlu menangani
 * kasus "barisnya belum ada" selain sebagai pengaman.
 */

/** Tanggal kemarin menurut WIB. */
const kemarinWib = (): string => {
  const hariIni = todayInJakarta();
  const kemarin = new Date(new Date(`${hariIni}T00:00:00Z`).getTime() - 86_400_000);

  return kemarin.toISOString().slice(0, 10);
};

export const getMine = async (userId: string): Promise<StreakRecord> => {
  const streak = await forUser(userId).findOne('streaks');

  if (!streak) {
    throw AppError.notFound('Data streak tidak ditemukan');
  }

  return streak;
};

/**
 * Menandai bahwa user melakukan pencatatan hari ini.
 *
 * Dipanggil setiap kali user menyimpan log harian apa pun. Aturannya:
 *   sudah tercatat hari ini  -> tidak berubah
 *   terakhir tercatat kemarin -> streak bertambah satu
 *   selain itu, atau belum pernah -> streak dimulai lagi dari satu
 */
export const recordActivity = async (userId: string): Promise<StreakRecord | null> => {
  const repo = forUser(userId);
  const streak = await repo.findOne('streaks');

  if (!streak) {
    logger.warn({ user_id: userId }, 'Baris streak tidak ada, seharusnya dibuat saat register');
    return null;
  }

  const hariIni = todayInJakarta();

  // Sudah dihitung hari ini, tidak ada yang perlu diubah. Keluar lebih awal
  // supaya pencatatan kedua di hari yang sama tidak menembak Directus lagi.
  if (streak.last_logged_date === hariIni) {
    return streak;
  }

  const berlanjut = streak.last_logged_date === kemarinWib();
  const current = berlanjut ? streak.current_streak + 1 : 1;

  return repo.update('streaks', streak.id, {
    current_streak: current,
    longest_streak: Math.max(streak.longest_streak, current),
    last_logged_date: hariIni,
  });
};

/**
 * Versi recordActivity yang tidak pernah melempar error.
 *
 * Dipanggil dari service pencatatan log. Streak itu fitur sekunder, kalau
 * pembaruannya gagal, log yang sudah tersimpan TIDAK boleh ikut dianggap gagal
 * dan membuat user mengira catatannya hilang. Kegagalannya cukup dicatat di log.
 */
export const recordActivitySafely = async (userId: string): Promise<void> => {
  try {
    await recordActivity(userId);
  } catch (error) {
    logger.error({ err: error, user_id: userId }, 'Gagal memperbarui streak');
  }
};
