import { type EnergyProfile, loadEnergyProfile } from '../../data/energy-profile.js';
import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { GoalRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { daysBetween, planWeightChange, type WeightPlan } from '../../utils/calories.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import { toNumber } from '../../utils/number.js';
import type { ObservedTdee } from '../../utils/observed-tdee.js';
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
  /** TDEE acuan saat ini. Null kalau profil belum diisi atau belum pernah menimbang. */
  tdee: number | null;
  /**
   * False kalau target hanya bisa dikejar dengan asupan di bawah batas aman.
   * Null kalau tidak cukup data untuk menilainya.
   */
  achievable: boolean | null;
  /**
   * Rencana lengkap: laju mingguan, tanggal realistis, dan langkah tambahan
   * kalau diet saja tidak cukup. Null kalau profil belum lengkap.
   *
   * Inilah yang menjawab "mau turun sekian kg dalam waktu sekian, harus gimana"
   * dengan angka yang bisa dijalankan, bukan cuma vonis bisa atau tidak.
   */
  plan: WeightPlan | null;
  /**
   * Hasil mengukur TDEE dari catatan berat dan makanan user sendiri.
   *
   * Ini yang membedakan angka di sini dari kalkulator mana pun: rumus cuma
   * dipakai sebagai titik awal, lalu digeser ke arah yang benar-benar terjadi
   * pada tubuh user ini. Null kalau profil belum lengkap.
   */
  observed_tdee: ObservedTdee | null;
}

/**
 * Rasio TDEE terukur terhadap hasil rumus.
 *
 * Dikirim ke simulasi sebagai RASIO, bukan angka mutlak, supaya koreksinya ikut
 * menyusut bersama berat badan sepanjang program.
 */
const faktorKoreksi = (p: EnergyProfile): number =>
  p.observed && p.observed.estimated > 0 ? p.observed.tdee / p.observed.estimated : 1;

/** Menyusun rencana untuk goal ini, atau null kalau datanya belum cukup. */
const susunRencana = (
  goal: Pick<GoalRecord, 'target_weight_kg' | 'target_date'>,
  p: EnergyProfile,
  daysRemaining: number,
): WeightPlan | null => {
  if (!p.complete) return null;

  return planWeightChange({
    currentWeightKg: p.weightKg,
    targetWeightKg: toNumber(goal.target_weight_kg),
    heightCm: p.heightCm,
    age: p.age,
    gender: p.gender,
    activityLevel: p.activityLevel,
    daysRemaining: Math.max(daysRemaining, 1),
    tdeeFactor: faktorKoreksi(p),
  });
};

const withProgress = (goal: GoalRecord, m: EnergyProfile): GoalWithProgress => {
  const daysRemaining = Math.max(daysBetween(todayInJakarta(), goal.target_date), 0);
  const targetKg = toNumber(goal.target_weight_kg);

  const rencana = susunRencana(goal, m, daysRemaining);

  return {
    ...goal,
    current_weight_kg: m.hasWeight ? m.weightKg : null,
    remaining_kg: m.hasWeight ? Number((m.weightKg - targetKg).toFixed(2)) : null,
    days_remaining: daysRemaining,
    tdee: rencana?.tdee ?? null,
    achievable: rencana?.achievable ?? null,
    plan: rencana,
    observed_tdee: m.observed,
  };
};

export const getActive = async (userId: string): Promise<GoalWithProgress | null> => {
  const [goal, metrics] = await Promise.all([
    forUser(userId).findOne('goals', { filter: { is_active: { _eq: true } } }),
    loadEnergyProfile(userId),
  ]);

  return goal ? withProgress(goal, metrics) : null;
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

  const [aktifLama, metrics] = await Promise.all([
    repo.findOne('goals', { filter: { is_active: { _eq: true } } }),
    loadEnergyProfile(userId),
  ]);

  const budget = data.daily_calorie_budget ?? autoBudget(metrics, data);

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

  return withProgress(goal, metrics);
};

/**
 * Menghitung budget kalori ketika user tidak menentukannya sendiri.
 *
 * Hasilnya sudah ditahan tiga pagar keamanan sekaligus — batas bawah kalori
 * menurut jenis kelamin, defisit maksimal 25% TDEE, dan laju maksimal per
 * minggu. Target yang terlalu agresif TIDAK menghasilkan anjuran berbahaya;
 * budget-nya ditahan di batas aman dan ketidakcocokannya dilaporkan lewat
 * `plan.achievable` beserta tanggal realistisnya.
 */
const autoBudget = (m: EnergyProfile, data: CreateGoalDto): number => {
  const rencana = susunRencana(
    { target_weight_kg: String(data.target_weight_kg), target_date: data.target_date },
    m,
    daysBetween(todayInJakarta(), data.target_date),
  );

  if (!rencana) {
    throw AppError.badRequest(
      'Tidak bisa menghitung budget kalori otomatis. Isi profil dan catat berat badan dulu, ' +
        'atau kirim daily_calorie_budget secara eksplisit.',
    );
  }

  return rencana.daily_calorie_budget;
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

  const metrics = await loadEnergyProfile(userId);

  return withProgress(updated, metrics);
};
