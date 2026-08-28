import { randomBytes } from 'node:crypto';

import { createUser, readItems, updateItem } from '@directus/sdk';
import bcrypt from 'bcryptjs';

import { directus } from '../../config/directus.js';
import { env } from '../../config/env.js';
import { withRetry } from '../../data/retry.js';
import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { UserRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import {
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../utils/jwt.js';
import { logger } from '../../utils/logger.js';
import type { LoginDto, RegisterDto } from './auth.validation.js';

/**
 * Cost factor bcrypt. 12 memakan waktu sekitar 250ms per hash di hardware biasa, * cukup lambat untuk melumpuhkan serangan brute force, masih cukup cepat untuk login.
 */
const BCRYPT_ROUNDS = 12;

/** Hash palsu untuk menyamakan waktu respons saat email tidak ditemukan. */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.Ki9wjSlN4cGDMdOdQKMcMlBpMOFwFYy';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  /**
   * Bisa null secara tipe karena kolomnya memang nullable, Directus yang
   * mengisinya lewat flag date-created, jadi tidak boleh NOT NULL di database.
   * Dalam praktiknya selalu terisi setelah item berhasil dibuat.
   */
  created_at: string | null;
}

export interface AuthResult {
  user: PublicUser;
  access_token: string;
  refresh_token: string;
}

/** Membuang password_hash dan field internal lain sebelum data dikirim ke client. */
const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  created_at: user.created_at,
});

/**
 * Collection `users` tidak dimiliki user mana pun, barisnya JUSTRU si user itu
 * sendiri, jadi tidak bisa lewat forUser(). Ini salah satu dari sedikit tempat
 * yang boleh menyentuh SDK langsung, dan alasannya harus tetap jelas.
 */
const findUserByEmail = async (email: string): Promise<UserRecord | null> => {
  const rows = await withRetry(
    () => directus.request(readItems('users', { filter: { email: { _eq: email } }, limit: 1 })),
    'cari user by email',
  );

  return rows[0] ?? null;
};

const findUserById = async (id: string): Promise<UserRecord | null> => {
  const rows = await withRetry(
    () => directus.request(readItems('users', { filter: { id: { _eq: id } }, limit: 1 })),
    'cari user by id',
  );

  return rows[0] ?? null;
};

/**
 * Menerbitkan pasangan token baru sekaligus mencatat refresh token-nya di database.
 * Yang disimpan adalah hash-nya, bukan token mentah.
 */
const issueTokens = async (
  user: UserRecord,
  userAgent: string | null,
): Promise<{ access_token: string; refresh_token: string }> => {
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const { token: refreshToken } = signRefreshToken(user.id);

  await forUser(user.id).create('refresh_tokens', {
    token_hash: hashRefreshToken(refreshToken),
    expires_at: refreshTokenExpiry(refreshToken).toISOString(),
    user_agent: userAgent,
  });

  return { access_token: accessToken, refresh_token: refreshToken };
};

/**
 * Membuat cerminan user di directus_users supaya terlihat di admin panel.
 *
 * Sengaja TIDAK fatal. Kalau langkah ini gagal, registrasi tetap lanjut dengan
 * directus_user_id bernilai null, kegagalan mencerminkan user ke admin panel
 * bukan alasan yang cukup untuk menolak pendaftaran. Kejadiannya dicatat di log,
 * dan nilai null-nya bisa dipakai untuk rekonsiliasi belakangan.
 *
 * Password di Directus sengaja diacak, bukan memakai password user. User tidak
 * pernah login ke admin panel, dan password aslinya tidak boleh ada di dua tempat.
 *
 * Catatan: validasi email Directus lebih ketat daripada Zod dan menolak TLD yang
 * tidak dikenal seperti ".local" atau ".test". Email semacam itu tetap bisa
 * mendaftar di aplikasi, hanya tidak tercermin ke admin panel.
 */
const syncUserToDirectus = async (user: UserRecord): Promise<string | null> => {
  if (!env.DIRECTUS_SYNC_USERS) return null;

  try {
    const created = await directus.request(
      createUser({
        email: user.email,
        password: randomBytes(32).toString('base64url'),
        first_name: user.name,
        status: 'active',
      }),
    );

    return created.id ?? null;
  } catch (error) {
    logger.warn(
      { err: error, user_id: user.id },
      'Gagal mencerminkan user ke directus_users, registrasi tetap dilanjutkan',
    );
    return null;
  }
};

/**
 * Mendaftarkan user baru.
 *
 * Menulis ke tiga collection sekaligus. Directus tidak punya transaction, jadi
 * seluruhnya dibungkus unitOfWork: kalau ada langkah yang gagal, apa pun yang
 * sudah terlanjur dibuat otomatis ditarik kembali. Lihat data/unit-of-work.ts.
 */
export const register = async (
  data: RegisterDto,
  userAgent: string | null,
): Promise<AuthResult> => {
  const existing = await findUserByEmail(data.email);
  if (existing) {
    throw AppError.emailTaken();
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

  const user = await unitOfWork(async (tx) => {
    const created = await tx.create('users', {
      email: data.email,
      password_hash: passwordHash,
      name: data.name,
    });

    const repo = forUser(created.id, tx);

    // Dibuat sekalian saat register supaya module streaks dan notifications
    // tidak perlu menangani kasus "barisnya belum ada".
    await repo.create('streaks', {
      current_streak: 0,
      longest_streak: 0,
      last_logged_date: null,
    });

    await repo.create('notification_settings', {});

    const directusUserId = await syncUserToDirectus(created);
    if (directusUserId) {
      await tx.update('users', created.id, { directus_user_id: directusUserId });
      return { ...created, directus_user_id: directusUserId };
    }

    return created;
  });

  // Sengaja DI LUAR unitOfWork. Kalau penerbitan token gagal, akun yang sudah
  // jadi tidak perlu ikut dibatalkan, user tinggal login biasa.
  const tokens = await issueTokens(user, userAgent);

  logger.info({ user_id: user.id }, 'User baru terdaftar');

  return { user: toPublicUser(user), ...tokens };
};

/**
 * Login.
 *
 * Email tidak ditemukan dan password salah menghasilkan error yang PERSIS SAMA,
 * dan tetap menjalankan bcrypt.compare terhadap hash palsu supaya waktu responsnya
 * seragam. Tanpa itu, selisih waktu respons bisa dipakai menebak email mana yang
 * terdaftar.
 */
export const login = async (data: LoginDto, userAgent: string | null): Promise<AuthResult> => {
  const user = await findUserByEmail(data.email);

  const matches = await bcrypt.compare(data.password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !matches) {
    throw AppError.invalidCredentials();
  }

  const tokens = await issueTokens(user, userAgent);

  logger.info({ user_id: user.id }, 'User login');

  return { user: toPublicUser(user), ...tokens };
};

/**
 * Menukar refresh token dengan pasangan token baru, sekaligus merotasi tokennya.
 *
 * Token lama langsung direvoke. Kalau ada yang mencoba memakai token yang SUDAH
 * direvoke, itu pertanda token bocor, semua token milik user tersebut ikut
 * direvoke, memaksa login ulang di seluruh device.
 */
export const refresh = async (rawToken: string, userAgent: string | null): Promise<AuthResult> => {
  const payload = verifyRefreshToken(rawToken);
  const tokenHash = hashRefreshToken(rawToken);

  const repo = forUser(payload.sub);

  const stored = await repo.findOne('refresh_tokens', {
    filter: { token_hash: { _eq: tokenHash } },
  });

  if (!stored) {
    throw AppError.invalidRefreshToken();
  }

  if (stored.revoked_at !== null) {
    logger.warn(
      { user_id: stored.user_id },
      'Refresh token yang sudah direvoke dipakai lagi, mencabut seluruh sesi user',
    );
    await revokeAllForUser(stored.user_id);
    throw AppError.invalidRefreshToken();
  }

  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    throw AppError.invalidRefreshToken();
  }

  const user = await findUserById(payload.sub);
  if (!user) {
    throw AppError.invalidRefreshToken();
  }

  await repo.update('refresh_tokens', stored.id, { revoked_at: new Date().toISOString() });

  const tokens = await issueTokens(user, userAgent);

  return { user: toPublicUser(user), ...tokens };
};

/**
 * Logout.
 *
 * Idempotent, token yang tidak ditemukan atau sudah direvoke tetap dianggap
 * berhasil. Client yang menekan logout dua kali tidak perlu melihat error, dan
 * respons yang seragam mencegah endpoint ini dipakai menebak token yang valid.
 */
export const logout = async (rawToken: string): Promise<void> => {
  let userId: string;
  let tokenHash: string;

  try {
    const payload = verifyRefreshToken(rawToken);
    userId = payload.sub;
    tokenHash = hashRefreshToken(rawToken);
  } catch {
    return;
  }

  const repo = forUser(userId);

  const stored = await repo.findOne('refresh_tokens', {
    filter: { token_hash: { _eq: tokenHash }, revoked_at: { _null: true } },
  });

  if (!stored) return;

  await repo.update('refresh_tokens', stored.id, { revoked_at: new Date().toISOString() });

  logger.info({ user_id: userId }, 'User logout');
};

/** Mencabut semua refresh token milik satu user. Dipakai saat terdeteksi token bocor. */
const revokeAllForUser = async (userId: string): Promise<void> => {
  const repo = forUser(userId);

  const active = await repo.list('refresh_tokens', {
    filter: { revoked_at: { _null: true } },
    limit: -1,
  });

  const now = new Date().toISOString();

  // Dijalankan paralel, bukan berurutan. Setiap panggilan adalah round-trip HTTP
  // ke Directus, jadi menunggu satu per satu membuat pencabutan darurat ini
  // lambat justru saat paling dibutuhkan.
  await Promise.all(
    active.map((token) =>
      directus.request(updateItem('refresh_tokens', token.id, { revoked_at: now })),
    ),
  );
};
