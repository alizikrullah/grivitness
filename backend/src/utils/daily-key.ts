/**
 * Directus tidak mendukung composite unique constraint, padahal beberapa collection
 * butuh jaminan "satu baris per user per hari".
 *
 * Gantinya: kolom `user_date_key` berisi "{user_id}:{YYYY-MM-DD}" dengan unique
 * constraint satu kolom. Jaminannya tetap di level database, bukan sekadar cek
 * di aplikasi yang bisa kena race condition saat dua request datang bersamaan.
 *
 * Berlaku untuk: weight_logs, body_photos, step_logs, body_measurements, mood_logs,
 * device_energy_logs, food_day_status.
 * Lihat CLAUDE.md section 13.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const dailyKey = (userId: string, loggedAt: string): string => {
  if (!DATE_PATTERN.test(loggedAt)) {
    throw new Error(`dailyKey butuh tanggal format YYYY-MM-DD, dapat "${loggedAt}"`);
  }

  return `${userId}:${loggedAt}`;
};

// Locale en-CA menghasilkan format YYYY-MM-DD, persis yang dibutuhkan Directus.
const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Tanggal hari ini di zona waktu WIB (UTC+7) dalam format YYYY-MM-DD. */
export const todayInJakarta = (): string => FORMATTER.format(new Date());

/**
 * Tanggal WIB dari sebuah timestamp.
 *
 * Dibutuhkan untuk mengelompokkan kolom bertipe timestamp per hari di sisi Node.
 * Memotong sepuluh karakter pertama dari string ISO akan memberi tanggal UTC, yang
 * untuk WIB berarti apa pun sebelum jam tujuh pagi jatuh ke hari kemarin.
 */
export const jakartaDate = (timestamp: string): string => FORMATTER.format(new Date(timestamp));

/**
 * Batas "hari tidur": jam 18:00 WIB. Tidur tanggal X adalah semua sesi yang
 * MULAI antara jam 18:00 tanggal X-1 dan jam 18:00 tanggal X.
 *
 * Dulu tidur dikelompokkan menurut tanggal BANGUN dari tiap sesi. Untuk malam
 * yang terpotong (tidur 21:00, kebangun 23:00, tidur lagi 02:00 sampai 04:20)
 * potongan pertama bangun sebelum tengah malam, jadi form menaruhnya di malam
 * tanggal yang dipilih: malam BERIKUTNYA. Akibatnya di data dia menumpuk
 * dengan tidur malam berikutnya, padahal kenyataannya tidak ada yang
 * bertabrakan. Kasus nyatanya 28 ke 29 Sep 2026.
 *
 * Dengan batas jam 18:00, seluruh tidur dari sore sampai pagi masuk satu
 * tanggal, yaitu pagi harinya, dan tidur siang tetap di harinya sendiri. Form
 * di mobile dan web memakai aturan yang sama: jam 18:00 ke atas berarti malam
 * sebelum tanggal yang dipilih.
 */
const BATAS_HARI_TIDUR_JAM = 18;

/** Tanggal tidur sebuah sesi: tanggal WIB dari jam mulai digeser 6 jam ke depan. */
export const sleepDay = (sleepStart: string): string =>
  jakartaDate(
    new Date(
      new Date(sleepStart).getTime() + (24 - BATAS_HARI_TIDUR_JAM) * 3_600_000,
    ).toISOString(),
  );
