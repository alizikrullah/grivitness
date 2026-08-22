import { readItems, updateItem } from '@directus/sdk';

import { directus } from '../../config/directus.js';
import { withRetry } from '../../data/retry.js';
import { forUser } from '../../data/scoped.js';
import type { UserProfileRecord, UserRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { calculateAge, calculateBMR, calculateTDEE } from '../../utils/calories.js';
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
 * bmr dan tdee bernilai null selama user belum pernah mencatat berat badan —
 * rumus Mifflin-St Jeor butuh berat, dan menebaknya akan menghasilkan angka
 * yang terlihat resmi padahal karangan.
 */
export interface ProfileWithDerived {
  id: string;
  height_cm: string;
  birth_date: string;
  gender: UserProfileRecord['gender'];
  activity_level: UserProfileRecord['activity_level'];
  age: number;
  /** Berat terakhir yang tercatat, dipakai sebagai dasar perhitungan. */
  current_weight_kg: number | null;
  bmr: number | null;
  tdee: number | null;
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
 * Collection `users` tidak bisa lewat forUser() — barisnya JUSTRU si user itu
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

/** Berat badan terakhir yang tercatat, atau null kalau user belum pernah menimbang. */
const latestWeightKg = async (userId: string): Promise<number | null> => {
  const log = await forUser(userId).findOne('weight_logs', {
    sort: ['-logged_at'],
    fields: ['weight_kg'],
  });

  return log ? toNumber(log.weight_kg) : null;
};

const withDerived = (profile: UserProfileRecord, weightKg: number | null): ProfileWithDerived => {
  const age = calculateAge(profile.birth_date);

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
    age,
    current_weight_kg: weightKg,
    bmr,
    tdee: bmr === null ? null : calculateTDEE(bmr, profile.activity_level),
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
};

export const getProfile = async (userId: string): Promise<ProfileWithDerived> => {
  // Dua query yang tidak saling bergantung, jadi dijalankan bersamaan.
  // Berurutan berarti menumpuk dua kali latensi tanpa alasan.
  const [profile, weightKg] = await Promise.all([
    forUser(userId).findOne('user_profiles'),
    latestWeightKg(userId),
  ]);

  if (!profile) {
    throw AppError.notFound('Profil belum diisi. Buat dulu lewat POST /api/users/me/profile');
  }

  return withDerived(profile, weightKg);
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
  const weightKg = await latestWeightKg(userId);

  return withDerived(created, weightKg);
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
  const weightKg = await latestWeightKg(userId);

  return withDerived(updated, weightKg);
};
