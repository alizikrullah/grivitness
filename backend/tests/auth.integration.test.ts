import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Test integrasi alur auth, menembak instance Directus yang sesungguhnya.
 *
 * Yang diuji di sini adalah perilaku yang TIDAK bisa dibuktikan lewat unit test:
 * unique constraint di database, cascade delete, rotasi refresh token lintas
 * request, dan bentuk error nyata dari Directus.
 */

const PASSWORD = 'RahasiaBanget123';

let app: Express;

beforeAll(async () => {
  app = createApp();
  // Menyapu sisa data dari eksekusi sebelumnya yang mungkin terhenti di tengah.
  await cleanupTestUsers();
});

afterAll(async () => {
  await cleanupTestUsers();
});

const daftar = async (email: string) =>
  request(app).post('/api/auth/register').send({ email, password: PASSWORD, name: 'Uji Coba' });

describe('POST /api/auth/register', () => {
  it('membuat akun dan langsung mengembalikan sepasang token', async () => {
    const res = await daftar(testEmail('register'));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toEqual(expect.any(String));
    expect(res.body.data.access_token).toEqual(expect.any(String));
    expect(res.body.data.refresh_token).toEqual(expect.any(String));
  });

  /** Kebocoran paling gampang terjadi: hash password ikut terkirim ke client. */
  it('tidak pernah membocorkan password_hash', async () => {
    const res = await daftar(testEmail('nohash'));

    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(JSON.stringify(res.body)).not.toContain('$2b$');
  });

  it('menolak email yang sudah terdaftar', async () => {
    const email = testEmail('dupe');
    await daftar(email);

    const res = await daftar(email);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('menolak data yang tidak valid dengan rincian per field', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'bukanemail', password: '123', name: 'X' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const fields = (res.body.error.details as { field: string }[]).map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'name']));
  });

  /**
   * Register menulis ke tiga collection. Karena Directus tidak punya transaction,
   * ketiganya harus benar-benar terbentuk, kalau tidak, module streaks dan
   * notifications akan menemukan barisnya kosong di kemudian hari.
   */
  it('sekalian membuat baris streaks dan notification_settings', async () => {
    const email = testEmail('turunan');
    const res = await daftar(email);
    const token = res.body.data.access_token as string;

    const { directus } = await import('../src/config/directus.js');
    const { readItems } = await import('@directus/sdk');
    const userId = res.body.data.user.id as string;

    const [streaks, settings] = await Promise.all([
      directus.request(readItems('streaks', { filter: { user_id: { _eq: userId } } })),
      directus.request(
        readItems('notification_settings', { filter: { user_id: { _eq: userId } } }),
      ),
    ]);

    expect(streaks).toHaveLength(1);
    expect(streaks[0]?.current_streak).toBe(0);
    expect(settings).toHaveLength(1);
    expect(settings[0]?.weight_reminder_time).toBe('21:00');
    expect(token).toBeTruthy();
  });
});

describe('POST /api/auth/login', () => {
  it('berhasil dengan password yang benar', async () => {
    const email = testEmail('login');
    await daftar(email);

    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.access_token).toEqual(expect.any(String));
  });

  /**
   * Pesan untuk "password salah" dan "email tidak terdaftar" harus IDENTIK.
   * Kalau berbeda, siapa pun bisa memakai endpoint login untuk memeriksa
   * email mana saja yang punya akun di sini.
   */
  it('memberi pesan identik untuk password salah dan email tak terdaftar', async () => {
    const email = testEmail('enum');
    await daftar(email);

    const passwordSalah = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'SalahBanget999' });

    const emailTakAda = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail('tidakada'), password: PASSWORD });

    expect(passwordSalah.status).toBe(401);
    expect(emailTakAda.status).toBe(401);
    expect(passwordSalah.body.error.code).toBe(emailTakAda.body.error.code);
    expect(passwordSalah.body.error.message).toBe(emailTakAda.body.error.message);
  });

  it('menerima email dengan huruf besar dan spasi berlebih', async () => {
    const email = testEmail('normalisasi');
    await daftar(email);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `  ${email.toUpperCase()}  `, password: PASSWORD });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/auth/refresh', () => {
  it('menukar refresh token dengan pasangan token yang baru', async () => {
    const res = await daftar(testEmail('refresh'));
    const tokenLama = res.body.data.refresh_token as string;

    const hasil = await request(app).post('/api/auth/refresh').send({ refresh_token: tokenLama });

    expect(hasil.status).toBe(200);
    expect(hasil.body.data.refresh_token).not.toBe(tokenLama);
    expect(hasil.body.data.access_token).toEqual(expect.any(String));
  });

  it('menolak refresh token lama setelah dirotasi', async () => {
    const res = await daftar(testEmail('rotasi'));
    const tokenLama = res.body.data.refresh_token as string;

    await request(app).post('/api/auth/refresh').send({ refresh_token: tokenLama });

    const ulang = await request(app).post('/api/auth/refresh').send({ refresh_token: tokenLama });

    expect(ulang.status).toBe(401);
    expect(ulang.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  /**
   * Pertahanan terpenting di seluruh module auth.
   *
   * Token yang sudah direvoke tapi dipakai lagi cuma punya satu penjelasan
   * masuk akal: ada salinan token yang bocor. Karena tidak mungkin membedakan
   * mana yang penyerang dan mana pemiliknya, SEMUA sesi user itu dicabut, termasuk
   * token baru yang barusan diterbitkan.
   */
  it('mencabut seluruh sesi user saat token bekas dipakai lagi', async () => {
    const res = await daftar(testEmail('bocor'));
    const tokenAsli = res.body.data.refresh_token as string;

    const rotasi = await request(app).post('/api/auth/refresh').send({ refresh_token: tokenAsli });
    const tokenBaru = rotasi.body.data.refresh_token as string;

    // Penyerang memakai token lama yang dia curi.
    await request(app).post('/api/auth/refresh').send({ refresh_token: tokenAsli });

    // Token milik pemilik sah pun ikut mati.
    const korban = await request(app).post('/api/auth/refresh').send({ refresh_token: tokenBaru });

    expect(korban.status).toBe(401);
    expect(korban.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('menolak token yang formatnya ngawur', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refresh_token: 'bukan.token.beneran' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('membuat refresh token tidak bisa dipakai lagi', async () => {
    const res = await daftar(testEmail('logout'));
    const token = res.body.data.refresh_token as string;

    const keluar = await request(app).post('/api/auth/logout').send({ refresh_token: token });
    expect(keluar.status).toBe(200);

    const coba = await request(app).post('/api/auth/refresh').send({ refresh_token: token });
    expect(coba.status).toBe(401);
  });

  /** Client yang menekan logout dua kali tidak perlu melihat error. */
  it('idempotent, aman dipanggil berkali-kali', async () => {
    const res = await daftar(testEmail('idempotent'));
    const token = res.body.data.refresh_token as string;

    const pertama = await request(app).post('/api/auth/logout').send({ refresh_token: token });
    const kedua = await request(app).post('/api/auth/logout').send({ refresh_token: token });

    expect(pertama.status).toBe(200);
    expect(kedua.status).toBe(200);
  });

  it('tetap membalas sukses untuk token ngawur, tidak membocorkan token mana yang sah', async () => {
    const res = await request(app).post('/api/auth/logout').send({ refresh_token: 'ngawur' });

    expect(res.status).toBe(200);
  });
});
