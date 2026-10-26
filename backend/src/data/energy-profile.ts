import { baselineTDEE, dailyCaloriesOut, outCorrectionFactor } from '../utils/calories.js';
import { jakartaDate, todayInJakarta } from '../utils/daily-key.js';
import { toNumber } from '../utils/number.js';
import { type ObservedTdee, observeTDEE, type WeightPoint } from '../utils/observed-tdee.js';
import { dateRangeFilter, timestampRangeFilter } from '../utils/query.js';
import { hariBelumLengkap } from './food-day-status.js';
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
  /**
   * Pengali kalori KELUAR supaya defisit di layar sesuai timbangan
   * (outCorrectionFactor). 1 berarti tidak dikoreksi: pengukurannya belum
   * layak atau profilnya belum lengkap.
   */
  outFactor: number;
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

  const [metrics, weightLogs, foodLogs, belumLengkap, sleepLogs, workoutLogs, deviceLogs] =
    await Promise.all([
      loadUserMetrics(userId),
      repo.list('weight_logs', {
        filter: dateRangeFilter(range),
        fields: ['logged_at', 'weight_kg'],
        sort: ['logged_at'],
        limit: -1,
      }),
      // Diambil barisnya lalu dijumlahkan di sini, bukan lewat agregasi Directus,
      // karena yang dibutuhkan adalah total PER HARI dan REST API-nya tidak punya
      // group by. Enam minggu catatan makan itu ratusan baris, murah.
      repo.list('food_logs', {
        filter: timestampRangeFilter(range),
        fields: ['logged_at', 'total_calories'],
        limit: -1,
      }),
      hariBelumLengkap(userId, range),
      // Tiga di bawah ini cuma untuk faktor koreksi kalori keluar: rumus keluar
      // per hari dihitung ulang di jendela yang sama dengan pengukurannya.
      repo.list('sleep_logs', {
        filter: dateRangeFilter(range),
        fields: ['logged_at', 'duration_minutes'],
        limit: -1,
      }),
      repo.list('workout_logs', {
        filter: dateRangeFilter(range),
        fields: ['logged_at', 'duration_minutes', 'calories_burned', 'tracked_by_device'],
        limit: -1,
      }),
      repo.list('device_energy_logs', {
        filter: dateRangeFilter(range),
        fields: ['logged_at', 'total_kcal', 'active_kcal'],
        limit: -1,
      }),
    ]);

  if (metrics.bmr === null) {
    return { ...metrics, baselineTdee: null, observed: null, outFactor: 1 };
  }

  const estimated = baselineTDEE(metrics.bmr, metrics.activityLevel);

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
    // Hari yang user tandai belum lengkap tidak boleh ikut: separuh catatan
    // makan terbaca sebagai makan sedikit, dan TDEE terukur ikut jatuh.
    if (tanggal === null || belumLengkap.has(tanggal)) continue;

    intakeByDate.set(tanggal, (intakeByDate.get(tanggal) ?? 0) + (log.total_calories ?? 0));
  }

  const observed = observeTDEE({ weights, intakeByDate, days: JENDELA_HARI, estimated });

  return {
    ...metrics,
    baselineTdee: observed.tdee,
    observed,
    outFactor:
      observed.reason === null
        ? outCorrectionFactor({
            measured: observed.measured,
            confidence: observed.confidence,
            formulaAverage: rataKeluarRumus({
              bmr: metrics.bmr,
              activityLevel: metrics.activityLevel,
              hariMakan: [...intakeByDate.keys()],
              sleepLogs,
              workoutLogs,
              deviceLogs,
            }),
          })
        : 1,
  };
};

/**
 * Rata-rata kalori keluar versi RUMUS di hari makan lengkap, dihitung persis
 * seperti getHistory(): dailyCaloriesOut() dengan BMR dari berat terakhir.
 * Hari tanpa catatan makan tidak ikut, sama seperti pengukurannya.
 */
const rataKeluarRumus = (input: {
  bmr: number;
  activityLevel: UserMetrics['activityLevel'];
  hariMakan: string[];
  sleepLogs: { logged_at: string; duration_minutes: number }[];
  workoutLogs: {
    logged_at: string;
    duration_minutes: number;
    calories_burned: number;
    tracked_by_device: boolean | null;
  }[];
  deviceLogs: { logged_at: string; total_kcal: number; active_kcal: number | null }[];
}): number => {
  if (input.hariMakan.length === 0) return 0;

  const tidur = new Map<string, number>();
  for (const t of input.sleepLogs) {
    tidur.set(t.logged_at, (tidur.get(t.logged_at) ?? 0) + t.duration_minutes);
  }

  const olahraga = new Map<string, { menit: number; kalori: number; tanpaJam: number }>();
  for (const o of input.workoutLogs) {
    const h = olahraga.get(o.logged_at) ?? { menit: 0, kalori: 0, tanpaJam: 0 };
    h.menit += o.duration_minutes;
    h.kalori += o.calories_burned;
    if (o.tracked_by_device !== true) h.tanpaJam += o.calories_burned;
    olahraga.set(o.logged_at, h);
  }

  const perangkat = new Map(input.deviceLogs.map((d) => [d.logged_at, d]));

  let total = 0;
  for (const tanggal of input.hariMakan) {
    const o = olahraga.get(tanggal);
    const jam = perangkat.get(tanggal);
    const menitTidur = tidur.get(tanggal) ?? 0;
    total += dailyCaloriesOut({
      bmr: input.bmr,
      activityLevel: input.activityLevel,
      sleepMinutes: menitTidur > 0 ? menitTidur : null,
      workoutMinutes: o?.menit ?? 0,
      workoutCalories: o?.kalori ?? 0,
      untrackedWorkoutCalories: o?.tanpaJam ?? 0,
      device: jam ? { total_kcal: jam.total_kcal, active_kcal: jam.active_kcal } : null,
    }).calories_out;
  }

  return total / input.hariMakan.length;
};
