import { readItems, updateItem } from '@directus/sdk';

import { directus } from '../../config/directus.js';
import { withRetry } from '../../data/retry.js';
import { forUser } from '../../data/scoped.js';
import type { UserProfileRecord, UserRecord } from '../../types/directus-schema.js';
import { ACTIVITY_LEVEL_LABEL } from '../../constants/enums.js';
import { type EnergyProfile, loadEnergyProfile } from '../../data/energy-profile.js';
import { AppError } from '../../utils/api-error.js';
import { calculateAge, calculateBMR } from '../../utils/calories.js';
import type { ObservedTdee } from '../../utils/observed-tdee.js';
import { toNumber } from '../../utils/number.js';
import type { CreateProfileDto, UpdateMeDto, UpdateProfileDto } from './users.validation.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  created_at: string | null;
}

/**
 * Profil ditambah nilai turunan yang dihitung backend.
 *
 * bmr dan tdee bernilai null selama user belum pernah mencatat berat badan, rumus
 * Mifflin-St Jeor butuh berat, dan menebaknya akan menghasilkan angka
 * yang terlihat resmi padahal karangan.
 */
export interface ProfileWithDerived {
  id: string;
  height_cm: string;
  birth_date: string;
  gender: UserProfileRecord['gender'];
  activity_level: UserProfileRecord['activity_level'];
  /**
   * Penjelasan activity_level dalam bahasa yang bisa dijawab user.
   *
   * Sejak TDEE memakai metode faktorial, field ini TIDAK lagi berarti "seberapa
   * aktif kamu", tidur, langkah, dan olahraga sudah punya potongan waktunya
   * sendiri. Yang ditanyakan sekarang adalah seperti apa sisa harimu, praktisnya
   * seperti apa pekerjaanmu. Label ini yang menyampaikan pergeseran itu ke layar.
   */
  activity_label: string;
  age: number;
  /** Berat terakhir yang tercatat, dipakai sebagai dasar perhitungan. */
  current_weight_kg: number | null;
  bmr: number | null;
  /**
   * TDEE untuk hari biasa: tidur normal, gerak seadanya, tanpa olahraga.
   *
   * Sengaja acuan dan bukan hari ini, karena angka ini jadi dasar budget kalori.
   * Kalau ikut naik-turun mengikuti aktivitas harian, user tidak pernah tahu
   * berapa yang boleh dimakan sampai harinya berakhir.
   *
   * Sudah dikoreksi pengukuran kalau datanya memadai, lihat `observed_tdee`.
   */
  tdee: number | null;
  /**
   * Hasil mengukur TDEE dari catatan berat dan makanan user sendiri.
   *
   * Rumus cuma titik awal. Begitu ada cukup data, angkanya digeser ke arah yang
   * benar-benar terjadi pada tubuh user ini, karena Mifflin-St Jeor tahu soal
   * 498 orang di tahun 1990, dan tidak tahu apa-apa soal orang ini.
   */
  observed_tdee: ObservedTdee | null;
  created_at: string | null;
  updated_at: string | null;
}

const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  created_at: user.created_at,
});

/**
 * Collection `users` tidak bisa lewat forUser(), barisnya JUSTRU si user itu
 * sendiri, bukan data yang dimilikinya. Ini salah satu dari sedikit tempat yang
 * boleh menyentuh SDK langsung, dan filternya tetap ditulis eksplisit.
 */
const findUserById = async (userId: string): Promise<UserRecord> => {
  const rows = await withRetry(
    () => directus.request(readItems('users', { filter: { id: { _eq: userId } }, limit: 1 })),
    'users.findById',
  );

  const user = rows[0];
  if (!user) {
    throw AppError.notFound('User tidak ditemukan');
  }

  return user;
};

export const getMe = async (userId: string): Promise<PublicUser> => {
  const user = await findUserById(userId);
  return toPublicUser(user);
};

export const updateMe = async (userId: string, data: UpdateMeDto): Promise<PublicUser> => {
  // Memastikan user ada dulu, supaya token yang menunjuk user terhapus
  // menghasilkan 404 yang jelas, bukan error mentah dari Directus.
  await findUserById(userId);

  const updated = await directus.request(updateItem('users', userId, data));

  return toPublicUser(updated);
};

const withDerived = (profile: UserProfileRecord, energy: EnergyProfile): ProfileWithDerived => {
  const age = calculateAge(profile.birth_date);
  const weightKg = energy.hasWeight ? energy.weightKg : null;

  const bmr =
    weightKg === null
      ? null
      : calculateBMR({
          weightKg,
          heightCm: toNumber(profile.height_cm),
          age,
          gender: profile.gender,
        });

  return {
    id: profile.id,
    height_cm: profile.height_cm,
    birth_date: profile.birth_date,
    gender: profile.gender,
    activity_level: profile.activity_level,
    activity_label: ACTIVITY_LEVEL_LABEL[profile.activity_level],
    age,
    current_weight_kg: weightKg,
    bmr,
    tdee: energy.baselineTdee,
    observed_tdee: energy.observed,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
};

export const getProfile = async (userId: string): Promise<ProfileWithDerived> => {
  // Dua query yang tidak saling bergantung, jadi dijalankan bersamaan.
  // Berurutan berarti menumpuk dua kali latensi tanpa alasan.
  const [profile, energy] = await Promise.all([
    forUser(userId).findOne('user_profiles'),
    loadEnergyProfile(userId),
  ]);

  if (!profile) {
    throw AppError.notFound('Profil belum diisi. Buat dulu lewat POST /api/users/me/profile');
  }

  return withDerived(profile, energy);
};

export const createProfile = async (
  userId: string,
  data: CreateProfileDto,
): Promise<ProfileWithDerived> => {
  const existing = await forUser(userId).findOne('user_profiles');
  if (existing) {
    throw AppError.duplicate('Profil sudah ada. Gunakan PATCH untuk mengubahnya.');
  }

  const created = await forUser(userId).create('user_profiles', data);
  const energy = await loadEnergyProfile(userId);

  return withDerived(created, energy);
};

export const updateProfile = async (
  userId: string,
  data: UpdateProfileDto,
): Promise<ProfileWithDerived> => {
  const repo = forUser(userId);

  const existing = await repo.findOne('user_profiles');
  if (!existing) {
    throw AppError.notFound('Profil belum diisi. Buat dulu lewat POST /api/users/me/profile');
  }

  const updated = await repo.update('user_profiles', existing.id, data);
  const energy = await loadEnergyProfile(userId);

  return withDerived(updated, energy);
};
