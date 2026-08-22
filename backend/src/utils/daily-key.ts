/**
 * Directus tidak mendukung composite unique constraint, padahal beberapa collection
 * butuh jaminan "satu baris per user per hari".
 *
 * Gantinya: kolom `user_date_key` berisi "{user_id}:{YYYY-MM-DD}" dengan unique
 * constraint satu kolom. Jaminannya tetap di level database, bukan sekadar cek
 * di aplikasi yang bisa kena race condition saat dua request datang bersamaan.
 *
 * Berlaku untuk: weight_logs, body_photos, step_logs, body_measurements, mood_logs.
 * Lihat CLAUDE.md section 13.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dailyKey = (userId: string, loggedAt: string): string => {
  if (!DATE_PATTERN.test(loggedAt)) {
    throw new Error(`dailyKey butuh tanggal format YYYY-MM-DD, dapat "${loggedAt}"`);
  }

  return `${userId}:${loggedAt}`;
};

/** Tanggal hari ini di zona waktu WIB (UTC+7) dalam format YYYY-MM-DD. */
export const todayInJakarta = (): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  // Locale en-CA menghasilkan format YYYY-MM-DD, persis yang dibutuhkan Directus.
  return formatter.format(new Date());
};
