import { forUser } from '../../data/scoped.js';
import { AppError } from '../../utils/api-error.js';
import { calculateAge, calculateBMR, calculateTDEE } from '../../utils/calories.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { toNumber } from '../../utils/number.js';
import { dateRangeFilter, timestampDayFilter, timestampRangeFilter } from '../../utils/query.js';

export interface DailySummary {
  date: string;
  weight_kg: number | null;
  calories_in: number;
  calories_out: number;
  calorie_budget: number | null;
  /** Sisa jatah kalori hari ini. Negatif berarti sudah lewat budget. */
  calories_remaining: number | null;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  steps: number;
  water_ml: number;
  sleep_minutes: number;
  workout_minutes: number;
  /**
   * Kalori dari olahraga saja, terpisah dari calories_out.
   *
   * calories_out sudah memuat TDEE dan langkah, jadi angkanya tidak bisa
   * dipakai untuk menjawab "olahraga tadi membakar berapa". Dipisah di sini
   * supaya layar bisa menampilkan durasi dan kalorinya berdampingan tanpa
   * harus memanggil endpoint olahraga lagi.
   */
  workout_calories: number;
  mood_score: number | null;
  energy_score: number | null;
  has_body_photo: boolean;
}

/**
 * Kalori keluar = TDEE + olahraga + langkah.
 *
 * Kalau profil belum diisi, TDEE tidak bisa dihitung dan yang tersisa hanya
 * kalori aktivitas. Nilainya jadi jauh lebih kecil dari kenyataan, tapi itu
 * lebih jujur daripada menebak metabolisme basal user.
 */
const hitungKaloriKeluar = (tdee: number | null, workout: number, steps: number): number =>
  (tdee ?? 0) + workout + steps;

/** TDEE saat ini, atau null kalau profil belum diisi atau belum pernah menimbang. */
const tdeeSaatIni = async (userId: string, weightKg: number | null): Promise<number | null> => {
  if (weightKg === null) return null;

  const profile = await forUser(userId).findOne('user_profiles');
  if (!profile) return null;

  const bmr = calculateBMR({
    weightKg,
    heightCm: toNumber(profile.height_cm),
    age: calculateAge(profile.birth_date),
    gender: profile.gender,
  });

  return calculateTDEE(bmr, profile.activity_level);
};

export const getDaily = async (userId: string, date: string): Promise<DailySummary> => {
  const repo = forUser(userId);
  const hari = { logged_at: { _eq: date } };
  const hariTimestamp = timestampDayFilter(date);

  // Dua belas query yang tidak saling bergantung. Berurutan berarti menumpuk
  // dua belas kali latensi HTTP ke Directus; paralel cuma selama yang paling
  // lambat. Ini alasan CLAUDE.md section 4 mewajibkan Promise.all.
  const [
    weightLog,
    goal,
    kaloriMasuk,
    protein,
    karbo,
    lemak,
    stepLog,
    air,
    tidur,
    workoutMenit,
    workoutKalori,
    mood,
    fotoBadan,
  ] = await Promise.all([
    repo.findOne('weight_logs', { filter: hari }),
    repo.findOne('goals', { filter: { is_active: { _eq: true } } }),
    repo.sum('food_logs', 'total_calories', hariTimestamp),
    repo.sum('food_logs', 'protein_g', hariTimestamp),
    repo.sum('food_logs', 'carbs_g', hariTimestamp),
    repo.sum('food_logs', 'fat_g', hariTimestamp),
    repo.findOne('step_logs', { filter: hari }),
    repo.sum('water_logs', 'amount_ml', hariTimestamp),
    repo.sum('sleep_logs', 'duration_minutes', hari),
    repo.sum('workout_logs', 'duration_minutes', hari),
    repo.sum('workout_logs', 'calories_burned', hari),
    repo.findOne('mood_logs', { filter: hari }),
    repo.count('body_photos', hari),
  ]);

  const weightKg = weightLog ? toNumber(weightLog.weight_kg) : null;
  const tdee = await tdeeSaatIni(userId, weightKg);

  const kaloriKeluar = hitungKaloriKeluar(tdee, workoutKalori, stepLog?.calories_burned ?? 0);
  const budget = goal?.daily_calorie_budget ?? null;

  return {
    date,
    weight_kg: weightKg,
    calories_in: kaloriMasuk,
    calories_out: kaloriKeluar,
    calorie_budget: budget,
    calories_remaining: budget === null ? null : budget - kaloriMasuk,
    protein_g: protein,
    carbs_g: karbo,
    fat_g: lemak,
    steps: stepLog?.steps ?? 0,
    water_ml: air,
    sleep_minutes: tidur,
    workout_minutes: workoutMenit,
    workout_calories: workoutKalori,
    mood_score: mood?.mood_score ?? null,
    energy_score: mood?.energy_score ?? null,
    has_body_photo: fotoBadan > 0,
  };
};

export interface PeriodSummary {
  from: string;
  to: string;
  days: number;
  weight_start: number | null;
  weight_end: number | null;
  weight_change_kg: number | null;
  total_calories_in: number;
  avg_calories_in: number;
  total_steps: number;
  avg_steps: number;
  total_water_ml: number;
  total_sleep_minutes: number;
  avg_sleep_minutes: number;
  total_workout_minutes: number;
  total_workout_calories: number;
  /** Berapa hari user benar-benar mencatat sesuatu dalam periode ini. */
  days_logged: number;
}

const rata = (total: number, hari: number): number =>
  hari === 0 ? 0 : Math.round((total / hari) * 10) / 10;

/**
 * Rekap satu rentang tanggal.
 *
 * Semua penjumlahan dikerjakan Postgres lewat agregasi, bukan dengan menarik
 * seluruh baris ke Node lalu menjumlahkannya. Untuk rentang sebulan bedanya
 * sudah terasa, dan untuk data bertahun-tahun bedanya menentukan.
 */
const getPeriod = async (userId: string, from: string, to: string): Promise<PeriodSummary> => {
  const repo = forUser(userId);
  const range = { from, to };
  const filterTanggal = dateRangeFilter(range);
  const filterTimestamp = timestampRangeFilter(range);

  const [
    beratAwal,
    beratAkhir,
    kalori,
    langkah,
    air,
    tidur,
    workoutMenit,
    workoutKalori,
    hariTercatat,
  ] = await Promise.all([
    repo.findOne('weight_logs', { filter: filterTanggal, sort: ['logged_at'] }),
    repo.findOne('weight_logs', { filter: filterTanggal, sort: ['-logged_at'] }),
    repo.sum('food_logs', 'total_calories', filterTimestamp),
    repo.sum('step_logs', 'steps', filterTanggal),
    repo.sum('water_logs', 'amount_ml', filterTimestamp),
    repo.sum('sleep_logs', 'duration_minutes', filterTanggal),
    repo.sum('workout_logs', 'duration_minutes', filterTanggal),
    repo.sum('workout_logs', 'calories_burned', filterTanggal),
    repo.count('weight_logs', filterTanggal),
  ]);

  const hari =
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;

  const awal = beratAwal ? toNumber(beratAwal.weight_kg) : null;
  const akhir = beratAkhir ? toNumber(beratAkhir.weight_kg) : null;

  return {
    from,
    to,
    days: hari,
    weight_start: awal,
    weight_end: akhir,
    weight_change_kg: awal === null || akhir === null ? null : Number((akhir - awal).toFixed(2)),
    total_calories_in: kalori,
    avg_calories_in: rata(kalori, hari),
    total_steps: langkah,
    avg_steps: rata(langkah, hari),
    total_water_ml: air,
    total_sleep_minutes: tidur,
    avg_sleep_minutes: rata(tidur, hari),
    total_workout_minutes: workoutMenit,
    total_workout_calories: workoutKalori,
    days_logged: hariTercatat,
  };
};

const geserHari = (date: string, hari: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + hari * 86_400_000).toISOString().slice(0, 10);

export const getWeekly = async (userId: string, from?: string): Promise<PeriodSummary> => {
  const mulai = from ?? geserHari(todayInJakarta(), -6);
  return getPeriod(userId, mulai, geserHari(mulai, 6));
};

export const getMonthly = async (
  userId: string,
  year?: number,
  month?: number,
): Promise<PeriodSummary> => {
  const hariIni = todayInJakarta();
  const tahun = year ?? Number(hariIni.slice(0, 4));
  const bulan = month ?? Number(hariIni.slice(5, 7));

  if (bulan < 1 || bulan > 12) {
    throw AppError.badRequest('Bulan harus antara 1 sampai 12');
  }

  const from = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  // Hari ke-0 bulan berikutnya adalah hari terakhir bulan ini, jadi tidak perlu
  // tabel jumlah hari per bulan maupun penanganan tahun kabisat.
  const to = new Date(Date.UTC(tahun, bulan, 0)).toISOString().slice(0, 10);

  return getPeriod(userId, from, to);
};
