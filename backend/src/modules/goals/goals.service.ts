import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { GoalRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import {
  calculateAge,
  calculateBMR,
  calculateCalorieBudget,
  calculateTDEE,
  daysBetween,
} from '../../utils/calories.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { toNumber } from '../../utils/number.js';
import type { CreateGoalDto, UpdateGoalDto } from './goals.validation.js';

/**
 * Goal ditambah nilai turunan yang membantu user memahami angkanya.
 *
 * Semua turunan dihitung ulang setiap kali dibaca, bukan disimpan di database.
 * Kalau disimpan, angkanya jadi basi begitu berat badan atau profil berubah,
 * dan user melihat sisa target yang tidak lagi benar.
 */
export interface GoalWithProgress extends GoalRecord {
  current_weight_kg: number | null;
  /** Sisa kilogram menuju target. Negatif berarti target sudah terlewati. */
  remaining_kg: number | null;
  days_remaining: number;
  /** TDEE saat ini. Null kalau profil belum diisi atau belum pernah menimbang. */
  tdee: number | null;
  /**
   * False kalau target hanya bisa dikejar dengan asupan di bawah batas aman.
   * Null kalau tidak cukup data untuk menilainya.
   */
  achievable: boolean | null;
}

/** Data user yang dibutuhkan berulang kali di module ini. */
interface UserContext {
  weightKg: number | null;
  tdee: number | null;
}

/**
 * Mengambil berat terakhir dan profil sekaligus, lalu menurunkan TDEE.
 *
 * Dua query dijalankan bersamaan karena tidak saling bergantung — berurutan
 * berarti menumpuk dua kali latensi HTTP ke Directus tanpa alasan.
 */
const loadUserContext = async (userId: string): Promise<UserContext> => {
  const repo = forUser(userId);

  const [weightLog, profile] = await Promise.all([
    repo.findOne('weight_logs', { sort: ['-logged_at'], fields: ['weight_kg'] }),
    repo.findOne('user_profiles'),
  ]);

  const weightKg = weightLog ? toNumber(weightLog.weight_kg) : null;

  if (weightKg === null || !profile) {
    return { weightKg, tdee: null };
  }

  const bmr = calculateBMR({
    weightKg,
    heightCm: toNumber(profile.height_cm),
    age: calculateAge(profile.birth_date),
    gender: profile.gender,
  });

  return { weightKg, tdee: calculateTDEE(bmr, profile.activity_level) };
};

const withProgress = (goal: GoalRecord, ctx: UserContext): GoalWithProgress => {
  const daysRemaining = Math.max(daysBetween(todayInJakarta(), goal.target_date), 0);
  const targetKg = toNumber(goal.target_weight_kg);

  let achievable: boolean | null = null;

  // Target dinilai realistis kalau budget yang dipilih user masih menghasilkan
  // defisit yang cukup untuk mencapai target sebelum tanggalnya.
  if (ctx.tdee !== null && ctx.weightKg !== null) {
    achievable = calculateCalorieBudget({
      tdee: ctx.tdee,
      currentWeightKg: ctx.weightKg,
      targetWeightKg: targetKg,
      daysRemaining: Math.max(daysRemaining, 1),
    }).achievable;
  }

  return {
    ...goal,
    current_weight_kg: ctx.weightKg,
    remaining_kg: ctx.weightKg === null ? null : Number((ctx.weightKg - targetKg).toFixed(2)),
    days_remaining: daysRemaining,
    tdee: ctx.tdee,
    achievable,
  };
};

export const getActive = async (userId: string): Promise<GoalWithProgress | null> => {
  const [goal, ctx] = await Promise.all([
    forUser(userId).findOne('goals', { filter: { is_active: { _eq: true } } }),
    loadUserContext(userId),
  ]);

  return goal ? withProgress(goal, ctx) : null;
};

export const list = async (userId: string): Promise<GoalRecord[]> =>
  forUser(userId).list('goals', { sort: ['-created_at'], limit: -1 });

/**
 * Membuat goal baru.
 *
 * Hanya boleh ada satu goal aktif per user, jadi goal lama dinonaktifkan lebih
 * dulu. Kedua penulisan dibungkus unitOfWork: kalau pembuatan goal baru gagal,
 * goal lama dikembalikan aktif. Tanpa itu user bisa berakhir tanpa goal sama
 * sekali padahal sebelumnya punya.
 */
export const create = async (userId: string, data: CreateGoalDto): Promise<GoalWithProgress> => {
  const repo = forUser(userId);

  const [aktifLama, ctx] = await Promise.all([
    repo.findOne('goals', { filter: { is_active: { _eq: true } } }),
    loadUserContext(userId),
  ]);

  const budget = data.daily_calorie_budget ?? autoBudget(ctx, data);

  const goal = await unitOfWork(async (tx) => {
    const scoped = forUser(userId, tx);

    if (aktifLama) {
      await scoped.update('goals', aktifLama.id, { is_active: false });
    }

    return scoped.create('goals', {
      target_weight_kg: data.target_weight_kg,
      target_date: data.target_date,
      daily_calorie_budget: budget,
      is_active: true,
    });
  });

  return withProgress(goal, ctx);
};

/** Menghitung budget kalori dari TDEE ketika user tidak menentukannya sendiri. */
const autoBudget = (ctx: UserContext, data: CreateGoalDto): number => {
  if (ctx.tdee === null || ctx.weightKg === null) {
    throw AppError.badRequest(
      'Tidak bisa menghitung budget kalori otomatis. Isi profil dan catat berat badan dulu, ' +
        'atau kirim daily_calorie_budget secara eksplisit.',
    );
  }

  return calculateCalorieBudget({
    tdee: ctx.tdee,
    currentWeightKg: ctx.weightKg,
    targetWeightKg: toNumber(data.target_weight_kg),
    daysRemaining: Math.max(daysBetween(todayInJakarta(), data.target_date), 1),
  }).daily_calorie_budget;
};

/**
 * Mengubah goal.
 *
 * Kalau goal ini diaktifkan, goal lain yang sedang aktif harus dinonaktifkan —
 * kalau tidak, aturan "satu goal aktif per user" bocor dan endpoint
 * GET /api/goals/active jadi tidak menentu mengembalikan yang mana.
 */
export const update = async (
  userId: string,
  goalId: string,
  data: UpdateGoalDto,
): Promise<GoalWithProgress> => {
  const repo = forUser(userId);

  // Melempar NOT_FOUND kalau goal ini bukan milik user tersebut.
  await repo.findById('goals', goalId);

  const perluMenonaktifkanYangLain = data.is_active === true;

  const aktifLain = perluMenonaktifkanYangLain
    ? await repo.list('goals', { filter: { is_active: { _eq: true }, id: { _neq: goalId } } })
    : [];

  const updated = await unitOfWork(async (tx) => {
    const scoped = forUser(userId, tx);

    for (const lain of aktifLain) {
      await scoped.update('goals', lain.id, { is_active: false });
    }

    return scoped.update('goals', goalId, data);
  });

  const ctx = await loadUserContext(userId);

  return withProgress(updated, ctx);
};
