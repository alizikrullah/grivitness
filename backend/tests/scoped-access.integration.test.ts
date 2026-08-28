import express, { type Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { forUser } from '../src/data/scoped.js';
import { authMiddleware } from '../src/middlewares/auth.middleware.js';
import { errorMiddleware } from '../src/middlewares/error.middleware.js';
import { AppError } from '../src/utils/api-error.js';
import { dailyKey } from '../src/utils/daily-key.js';
import { signAccessToken, signRefreshToken } from '../src/utils/jwt.js';
import { getAuthUser } from '../src/types/index.js';
import { sendSuccess } from '../src/utils/response.js';
import { createApp } from '../src/app.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Dua hal diuji di sini:
 *
 * 1. auth.middleware, sampai sekarang belum ada endpoint protected di aplikasi,
 *    jadi tanpa test ini perilakunya sama sekali belum pernah dibuktikan.
 *
 * 2. forUser(), lapisan yang mencegah data satu user terbaca user lain.
 *    Backend memakai admin token, jadi kalau lapisan ini bocor, tidak ada
 *    pertahanan lain di belakangnya.
 */

let app: Express;
let userA: { id: string; email: string; token: string };
let userB: { id: string; email: string; token: string };

const daftar = async (label: string) => {
  const email = testEmail(label);
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'RahasiaBanget123', name: 'Uji Coba' });

  return {
    id: res.body.data.user.id as string,
    email,
    token: res.body.data.access_token as string,
  };
};

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();
  userA = await daftar('scopedA');
  userB = await daftar('scopedB');
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe('authMiddleware', () => {
  /** App kecil terpisah, cuma untuk menguji middleware-nya sendiri. */
  const buildProtectedApp = (): Express => {
    const test = express();
    test.use(express.json());
    test.get('/protected', authMiddleware, (req, res) => {
      sendSuccess(res, { user: getAuthUser(req) });
    });
    test.use(errorMiddleware);
    return test;
  };

  it('meloloskan request dengan access token yang sah', async () => {
    const res = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(userA.id);
    expect(res.body.data.user.email).toBe(userA.email);
  });

  it('menolak request tanpa header Authorization', async () => {
    const res = await request(buildProtectedApp()).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it.each([
    ['tanpa skema Bearer', (t: string) => t],
    ['skema salah', (t: string) => `Basic ${t}`],
    ['token kosong', () => 'Bearer '],
    ['token ngawur', () => 'Bearer bukan.token.beneran'],
  ])('menolak header %s', async (_label, buat) => {
    const res = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', buat(userA.token));

    expect(res.status).toBe(401);
  });

  /**
   * Refresh token umurnya 7 hari, access token 15 menit. Kalau refresh token
   * diterima sebagai access token, token curian jadi berlaku 7 hari penuh.
   */
  it('menolak refresh token yang dipakai sebagai access token', async () => {
    const { token } = signRefreshToken(userA.id);

    const res = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('menolak token yang sudah kedaluwarsa', async () => {
    const kedaluwarsa = signAccessToken({ sub: userA.id, email: userA.email });
    // Token dengan masa berlaku negatif dibuat lewat jalur yang sama seperti
    // token asli, jadi yang diuji benar-benar pemeriksaan kedaluwarsa.
    const { default: jwt } = await import('jsonwebtoken');
    const mati = jwt.sign({ email: userA.email }, process.env.JWT_SECRET!, {
      subject: userA.id,
      issuer: 'grivitness-api',
      expiresIn: '-1s',
    });

    const res = await request(buildProtectedApp())
      .get('/protected')
      .set('Authorization', `Bearer ${mati}`);

    expect(res.status).toBe(401);
    expect(kedaluwarsa).toBeTruthy();
  });
});

describe('forUser, pembatasan akses antar user', () => {
  const hariIni = '2026-08-22';

  it('hanya mengembalikan data milik user yang bersangkutan', async () => {
    const repoA = forUser(userA.id);
    const repoB = forUser(userB.id);

    await repoA.create('weight_logs', {
      weight_kg: '80.00',
      logged_at: hariIni,
      user_date_key: dailyKey(userA.id, hariIni),
    });

    await repoB.create('weight_logs', {
      weight_kg: '90.00',
      logged_at: hariIni,
      user_date_key: dailyKey(userB.id, hariIni),
    });

    const punyaA = await repoA.list('weight_logs');
    const punyaB = await repoB.list('weight_logs');

    expect(punyaA).toHaveLength(1);
    expect(punyaB).toHaveLength(1);
    expect(punyaA[0]?.weight_kg).toBe('80.00');
    expect(punyaB[0]?.weight_kg).toBe('90.00');
  });

  /**
   * Inti pertahanannya: user B tidak boleh bisa mengambil data user A sekalipun
   * dia entah bagaimana tahu id barisnya.
   */
  it('menolak findById untuk data milik user lain', async () => {
    const punyaA = await forUser(userA.id).list('weight_logs');
    const idMilikA = punyaA[0]!.id;

    await expect(forUser(userB.id).findById('weight_logs', idMilikA)).rejects.toThrow(AppError);
  });

  it('menolak update data milik user lain', async () => {
    const punyaA = await forUser(userA.id).list('weight_logs');
    const idMilikA = punyaA[0]!.id;

    await expect(
      forUser(userB.id).update('weight_logs', idMilikA, { weight_kg: '1.00' }),
    ).rejects.toThrow(AppError);

    // Nilainya harus tetap utuh setelah percobaan gagal itu.
    const sesudah = await forUser(userA.id).findById('weight_logs', idMilikA);
    expect(sesudah.weight_kg).toBe('80.00');
  });

  it('menolak remove data milik user lain', async () => {
    const punyaA = await forUser(userA.id).list('weight_logs');
    const idMilikA = punyaA[0]!.id;

    await expect(forUser(userB.id).remove('weight_logs', idMilikA)).rejects.toThrow(AppError);

    const masihAda = await forUser(userA.id).list('weight_logs');
    expect(masihAda).toHaveLength(1);
  });

  /**
   * Filter kepemilikan digabung dengan _and, bukan disebar. Jadi walaupun
   * pemanggil mengirim filter user_id sendiri, syarat aslinya tetap berlaku.
   */
  it('tidak bisa ditimpa lewat filter user_id dari pemanggil', async () => {
    const hasil = await forUser(userB.id).list('weight_logs', {
      filter: { user_id: { _eq: userA.id } },
    });

    expect(hasil).toHaveLength(0);
  });

  it('mengisi user_id otomatis saat membuat data', async () => {
    const dibuat = await forUser(userA.id).create('mood_logs', {
      mood_score: 4,
      energy_score: 3,
      logged_at: hariIni,
      user_date_key: dailyKey(userA.id, hariIni),
    });

    expect(dibuat.user_id).toBe(userA.id);
  });

  it('menghitung count dan sum hanya untuk data user itu', async () => {
    const repoA = forUser(userA.id);

    await repoA.create('water_logs', { amount_ml: 500, logged_at: new Date().toISOString() });
    await repoA.create('water_logs', { amount_ml: 300, logged_at: new Date().toISOString() });
    await forUser(userB.id).create('water_logs', {
      amount_ml: 9999,
      logged_at: new Date().toISOString(),
    });

    expect(await repoA.count('water_logs')).toBe(2);
    expect(await repoA.sum('water_logs', 'amount_ml')).toBe(800);
  });
});

describe('user_date_key, pengganti composite unique', () => {
  it('menolak dua log pada tanggal sama untuk user yang sama', async () => {
    const tanggal = '2026-01-15';
    const repo = forUser(userA.id);

    await repo.create('weight_logs', {
      weight_kg: '81.00',
      logged_at: tanggal,
      user_date_key: dailyKey(userA.id, tanggal),
    });

    await expect(
      repo.create('weight_logs', {
        weight_kg: '82.00',
        logged_at: tanggal,
        user_date_key: dailyKey(userA.id, tanggal),
      }),
    ).rejects.toThrow();
  });

  it('mengizinkan user berbeda mencatat di tanggal yang sama', async () => {
    const tanggal = '2026-01-16';

    await forUser(userA.id).create('weight_logs', {
      weight_kg: '81.00',
      logged_at: tanggal,
      user_date_key: dailyKey(userA.id, tanggal),
    });

    const punyaB = await forUser(userB.id).create('weight_logs', {
      weight_kg: '91.00',
      logged_at: tanggal,
      user_date_key: dailyKey(userB.id, tanggal),
    });

    expect(punyaB.id).toEqual(expect.any(String));
  });
});

describe('GET /api/files/:id, penyajian file privat', () => {
  /**
   * File di Directus bersifat privat, jadi client tidak bisa memuatnya langsung.
   * Backend yang menyajikannya setelah memastikan file itu memang dirujuk oleh
   * catatan milik user yang sedang login.
   *
   * Baris food_logs dibuat langsung lewat repo, tanpa melewati endpoint upload,
   * supaya test ini tidak memakai kuota Groq. Yang diuji di sini pemeriksaan
   * kepemilikannya, bukan pipeline analisanya.
   */
  // UUID v4 yang sah. Versi dan variant bit-nya harus benar, kalau tidak
  // validasi param menolaknya lebih dulu dan yang teruji jadi bukan
  // pemeriksaan kepemilikan.
  const FILE_ID = '11111111-2222-4333-8444-555555555555';

  beforeAll(async () => {
    await forUser(userA.id).create('food_logs', {
      photo_url: `/api/files/${FILE_ID}`,
      directus_file_id: null,
      meal_type: 'LUNCH',
      ai_analysis: {},
      total_calories: 500,
      protein_g: '20.00',
      carbs_g: '60.00',
      fat_g: '15.00',
      logged_at: new Date().toISOString(),
    });
  });

  it('menolak akses tanpa autentikasi', async () => {
    const res = await request(app).get(`/api/files/${FILE_ID}`);

    expect(res.status).toBe(401);
  });

  /**
   * Inti pengamanannya: backend mengambil file memakai admin token, jadi tanpa
   * pemeriksaan kepemilikan siapa pun yang punya akun bisa membuka foto badan
   * user lain hanya dengan menebak id.
   */
  it('menolak file yang tidak dirujuk catatan milik user itu', async () => {
    const res = await request(app)
      .get(`/api/files/${FILE_ID}`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('menolak id yang formatnya bukan uuid', async () => {
    const res = await request(app)
      .get('/api/files/bukan-uuid')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(400);
  });
});
