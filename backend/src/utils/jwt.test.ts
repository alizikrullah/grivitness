import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { AppError } from './api-error.js';
import {
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt.js';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const EMAIL = 'ali@example.com';

describe('access token', () => {
  it('membawa user id dan email yang sama saat diverifikasi', () => {
    const token = signAccessToken({ sub: USER_ID, email: EMAIL });
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe(USER_ID);
    expect(payload.email).toBe(EMAIL);
  });

  it('menolak token yang tanda tangannya diubah', () => {
    const token = signAccessToken({ sub: USER_ID, email: EMAIL });
    const dirusak = `${token.slice(0, -3)}xyz`;

    expect(() => verifyAccessToken(dirusak)).toThrow(AppError);
  });

  it('menolak token yang ditandatangani dengan secret lain', () => {
    const palsu = jwt.sign({ email: EMAIL }, 'secret-lain-yang-panjangnya-cukup-32-karakter', {
      subject: USER_ID,
      issuer: 'grivitness-api',
    });

    expect(() => verifyAccessToken(palsu)).toThrow(AppError);
  });

  /**
   * Access token dan refresh token memakai secret berbeda. Kalau tertukar,
   * refresh token yang umurnya 7 hari bisa dipakai sebagai access token, artinya token
   * curian jadi berlaku jauh lebih lama dari yang dirancang.
   */
  it('menolak refresh token yang dipakai sebagai access token', () => {
    const { token } = signRefreshToken(USER_ID);

    expect(() => verifyAccessToken(token)).toThrow(AppError);
  });

  it('menolak token yang sudah kedaluwarsa', () => {
    const kedaluwarsa = jwt.sign({ email: EMAIL }, process.env.JWT_SECRET!, {
      subject: USER_ID,
      issuer: 'grivitness-api',
      expiresIn: '-1s',
    });

    expect(() => verifyAccessToken(kedaluwarsa)).toThrow(AppError);
  });

  it('menolak token dengan issuer yang salah', () => {
    const asing = jwt.sign({ email: EMAIL }, process.env.JWT_SECRET!, {
      subject: USER_ID,
      issuer: 'aplikasi-lain',
    });

    expect(() => verifyAccessToken(asing)).toThrow(AppError);
  });
});

describe('refresh token', () => {
  it('membawa user id dan jti', () => {
    const { token, jti } = signRefreshToken(USER_ID);
    const payload = verifyRefreshToken(token);

    expect(payload.sub).toBe(USER_ID);
    expect(payload.jti).toBe(jti);
  });

  /**
   * Dua refresh token untuk user yang sama harus berbeda, supaya login di dua
   * device menghasilkan sesi terpisah yang bisa direvoke sendiri-sendiri.
   */
  it('selalu menghasilkan token berbeda walau untuk user yang sama', () => {
    const a = signRefreshToken(USER_ID);
    const b = signRefreshToken(USER_ID);

    expect(a.token).not.toBe(b.token);
    expect(a.jti).not.toBe(b.jti);
  });

  it('menolak access token yang dipakai sebagai refresh token', () => {
    const token = signAccessToken({ sub: USER_ID, email: EMAIL });

    expect(() => verifyRefreshToken(token)).toThrow(AppError);
  });

  it('kedaluwarsa dalam 7 hari sesuai konfigurasi', () => {
    const { token } = signRefreshToken(USER_ID);
    const expiry = refreshTokenExpiry(token);

    const selisihHari = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

    expect(selisihHari).toBeGreaterThan(6.9);
    expect(selisihHari).toBeLessThan(7.1);
  });
});

describe('hashRefreshToken', () => {
  it('menghasilkan SHA-256 hex 64 karakter', () => {
    const hash = hashRefreshToken('token-apa-saja');

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('konsisten untuk input yang sama', () => {
    expect(hashRefreshToken('sama')).toBe(hashRefreshToken('sama'));
  });

  it('berbeda untuk input yang berbeda', () => {
    expect(hashRefreshToken('satu')).not.toBe(hashRefreshToken('dua'));
  });

  /** Yang disimpan di database harus hash-nya, bukan tokennya. */
  it('tidak mengandung token aslinya', () => {
    const token = 'rahasia-yang-tidak-boleh-tersimpan';

    expect(hashRefreshToken(token)).not.toContain(token);
  });
});
