import { baselineTDEE } from '../utils/calories.js';
import { jakartaDate, todayInJakarta } from '../utils/daily-key.js';
import { toNumber } from '../utils/number.js';
import { type ObservedTdee, observeTDEE, type WeightPoint } from '../utils/observed-tdee.js';
import { dateRangeFilter, timestampRangeFilter } from '../utils/query.js';
import { forUser } from './scoped.js';
import { loadUserMetrics, type UserMetrics } from './user-metrics.js';

/**
 * Menggabungkan ukuran tubuh user dengan TDEE yang dikoreksi data nyatanya.
 *
 * Ini lapisan yang membuat aplikasi berhenti menebak. Rumus tetap dipakai
 * sebagai titik awal, tapi begitu ada cukup catatan berat dan makanan, angkanya
 * digeser ke arah yang benar-benar terjadi pada tubuh user ini.
 */

/**
 * Panjang jendela pengamatan.
 *
 * Enam minggu cukup panjang untuk meredam fluktuasi air dan cukup pendek untuk
 * tetap menggambarkan metabolisme user SEKARANG. Terlalu panjang justru
 * berbahaya: metabolisme ikut turun seiring berat badan, jadi data setengah
 * tahun lalu menggambarkan orang yang sudah tidak ada.
 */
const JENDELA_HARI = 42;

export interface EnergyProfile extends UserMetrics {
  /**
   * TDEE acuan hari biasa yang dipakai untuk budget kalori.
   * Null selama profil belum diisi atau user belum pernah menimbang.
   */
  baselineTdee: number | null;
  /** Rincian pengukuran. Null kalau profil belum lengkap. */
  observed: ObservedTdee | null;
}

const geser = (date: string, hari: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + hari * 86_400_000).toISOString().slice(0, 10);

/**
 * Mengambil metrik tubuh, riwayat berat, dan asupan sekaligus.
 *
 * Ketiganya tidak saling bergantung, jadi dijalankan bersamaan. Berurutan
 * berarti menumpuk tiga kali latensi HTTP ke Directus tanpa alasan.
 */
export const loadEnergyProfile = async (userId: string): Promise<EnergyProfile> => {
  const repo = forUser(userId);

  const to = todayInJakarta();
  const from = geser(to, -(JENDELA_HARI - 1));
  const range = { from, to };

  const [metrics, weightLogs, foodLogs] = await Promise.all([
    loadUserMetrics(userId),
    repo.list('weight_logs', {
      filter: dateRangeFilter(range),
      fields: ['logged_at', 'weight_kg'],
      sort: ['logged_at'],
      limit: -1,
    }),
    // Diambil barisnya lalu dijumlahkan di sini, bukan lewat agregasi Directus,
    // karena yang dibutuhkan adalah total PER HARI dan REST API-nya tidak punya
    // group by. Enam minggu catatan makan itu ratusan baris — murah.
    repo.list('food_logs', {
      filter: timestampRangeFilter(range),
      fields: ['logged_at', 'total_calories'],
      limit: -1,
    }),
  ]);

  if (metrics.bmr === null) {
    return { ...metrics, baselineTdee: null, observed: null };
  }

  const estimated = baselineTDEE(metrics.bmr, metrics.weightKg, metrics.activityLevel);

  const weights: WeightPoint[] = weightLogs.map((log) => ({
    date: log.logged_at,
    kg: toNumber(log.weight_kg),
  }));

  const intakeByDate = new Map<string, number>();

  for (const log of foodLogs) {
    // Dikelompokkan menurut tanggal WIB, bukan UTC. Kalau memakai UTC, makan
    // malam sebelum jam tujuh pagi WIB akan jatuh ke hari sebelumnya dan
    // merusak rata-rata harian yang jadi dasar seluruh perhitungan ini.
    const tanggal = log.logged_at === null ? null : jakartaDate(log.logged_at);
    if (tanggal === null) continue;

    intakeByDate.set(tanggal, (intakeByDate.get(tanggal) ?? 0) + (log.total_calories ?? 0));
  }

  const observed = observeTDEE({ weights, intakeByDate, days: JENDELA_HARI, estimated });

  return { ...metrics, baselineTdee: observed.tdee, observed };
};
