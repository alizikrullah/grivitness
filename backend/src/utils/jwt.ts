import { createHash, randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { AppError } from './api-error.js';

/**
 * Dua jenis token sesuai CLAUDE.md section 6:
 *
 * - access_token  : umur pendek (15 menit), dipakai di header Authorization.
 *                   Tidak disimpan di database, cukup diverifikasi tanda tangannya.
 *
 * - refresh_token : umur panjang (7 hari), dipakai menukar access_token baru.
 *                   Hash-nya DISIMPAN di collection refresh_tokens supaya bisa
 *                   direvoke saat logout dan dirotasi setiap kali dipakai.
 */

const ISSUER = 'grivitness-api';

/**
 * @types/jsonwebtoken menyempitkan tipe expiresIn jadi format literal tertentu,
 * sementara nilainya di sini datang dari env sebagai string biasa.
 * Cast ini menjembatani keduanya — nilainya sendiri sudah divalidasi di env.ts.
 */
const asExpiry = (value: string): jwt.SignOptions['expiresIn'] =>
  value as jwt.SignOptions['expiresIn'];

export interface AccessTokenPayload {
  /** User id. Dinamai `sub` mengikuti konvensi JWT. */
  sub: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Id unik token ini, supaya dua refresh token milik user sama tetap berbeda. */
  jti: string;
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign({ email: payload.email }, env.JWT_SECRET, {
    subject: payload.sub,
    expiresIn: asExpiry(env.ACCESS_TOKEN_EXPIRY),
    issuer: ISSUER,
  });

export const signRefreshToken = (userId: string): { token: string; jti: string } => {
  const jti = randomUUID();

  const token = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    subject: userId,
    jwtid: jti,
    expiresIn: asExpiry(env.REFRESH_TOKEN_EXPIRY),
    issuer: ISSUER,
  });

  return { token, jti };
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });

    if (typeof decoded === 'string' || !decoded.sub || typeof decoded.email !== 'string') {
      throw AppError.unauthorized('Token tidak valid');
    }

    return { sub: decoded.sub, email: decoded.email };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token sudah kedaluwarsa');
    }
    throw AppError.unauthorized('Token tidak valid');
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: ISSUER });

    if (typeof decoded === 'string' || !decoded.sub || !decoded.jti) {
      throw AppError.invalidRefreshToken();
    }

    return { sub: decoded.sub, jti: decoded.jti };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.invalidRefreshToken();
  }
};

/**
 * Yang disimpan di database adalah SHA-256 dari refresh token, bukan token mentahnya.
 * Kalau isi database bocor, token di dalamnya tidak bisa langsung dipakai.
 *
 * SHA-256 tanpa salt sudah memadai di sini — berbeda dengan password, refresh token
 * punya entropi tinggi dan acak, jadi tidak rentan serangan kamus.
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Kapan refresh token ini kedaluwarsa, dibaca dari klaim exp di dalamnya. */
export const refreshTokenExpiry = (token: string): Date => {
  const decoded = jwt.decode(token);

  if (typeof decoded === 'string' || decoded === null || typeof decoded.exp !== 'number') {
    throw AppError.invalidRefreshToken();
  }

  return new Date(decoded.exp * 1000);
};
