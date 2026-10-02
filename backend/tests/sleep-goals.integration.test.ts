import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { todayInJakarta } from '../src/utils/daily-key.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Dua aturan rilis 1.2.0 yang hidup di data sungguhan: tidur yang bertabrakan
 * ditolak, dan jatah kalori otomatis mengikuti berat terbaru sementara jatah
 * manual dikunci.
 */

let app: Express;
let token: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('sleepgoal'), password: 'RahasiaBanget123', name: 'Uji Tidur' });
  token = daftar.body.data.access_token as string;

  const profil = await request(app).post('/api/users/me/profile').set(auth()).send({
    height_cm: 165,
    birth_date: '2001-02-26',
    gender: 'MALE',
    activity_level: 'SEDENTARY',
  });
  const berat = await request(app)
    .post('/api/weight')
    .set(auth())
    .send({ weight_kg: 96, logged_at: '2026-09-20' });
  if (profil.status !== 201 || berat.status !== 201) throw new Error('setup gagal');
});

afterAll(async () => {
  await cleanupTestUsers();
});

/** Kasus nyata 29 ke 30 Sep 2026, dipindah ke 2020 supaya tidak bertemu data lain. */
describe('tidur yang bertabrakan', () => {
  let pertama = '';

  it('sesi pertama tersimpan', async () => {
    const res = await request(app).post('/api/sleep').set(auth()).send({
      sleep_start: '2020-09-29T14:00:00.000Z',
      sleep_end: '2020-09-29T16:00:00.000Z',
      quality_score: 3,
    });
    expect(res.status).toBe(201);
    pertama = res.body.data.id as string;
  });

  it('sesi yang menimpa sebagian ditolak, dengan jam sesi yang ditabrak', async () => {
    const res = await request(app).post('/api/sleep').set(auth()).send({
      sleep_start: '2020-09-29T15:30:00.000Z',
      sleep_end: '2020-09-29T21:20:00.000Z',
      quality_score: 4,
    });

    expect(res.status).toBe(409);
    // 14.00Z = 21.00 WIB
    expect(res.body.error.message).toContain('21.00');
  });

  it('bersentuhan persis bukan tabrakan', async () => {
    const res = await request(app).post('/api/sleep').set(auth()).send({
      sleep_start: '2020-09-29T16:00:00.000Z',
      sleep_end: '2020-09-29T21:20:00.000Z',
      quality_score: 4,
    });
    expect(res.status).toBe(201);
  });

  it('mengubah sesi sampai menabrak sesi lain juga ditolak', async () => {
    const res = await request(app)
      .patch(`/api/sleep/${pertama}`)
      .set(auth())
      .send({ sleep_end: '2020-09-29T17:00:00.000Z' });

    expect(res.status).toBe(409);
  });

  it('mengubah sesi itu sendiri tidak dihitung menabrak dirinya', async () => {
    const res = await request(app)
      .patch(`/api/sleep/${pertama}`)
      .set(auth())
      .send({ sleep_start: '2020-09-29T14:30:00.000Z' });

    expect(res.status).toBe(200);
  });
});

/**
 * Jatah otomatis = jatah kartu rencana, dihitung ulang dari berat terbaru.
 * Target di sini agresif seperti target pemiliknya (sekitar 1 kg per minggu
 * lebih), jadi jatahnya ditahan pagar aman yang mengikuti TDEE: berat turun,
 * jatah ikut turun. Untuk target yang santai dan user yang lebih cepat dari
 * rencana, jatahnya justru bisa naik, karena defisit yang dibutuhkan untuk
 * tiba tepat di tanggal itu mengecil; kartu rencana menghitung dengan cara
 * yang sama.
 */
describe('jatah kalori otomatis dan manual', () => {
  let goalId = '';
  let jatahAwal = 0;
  let beratHariIni = '';
  const sebulanLagi = new Date(
    new Date(`${todayInJakarta()}T00:00:00Z`).getTime() + 30 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  it('goal tanpa jatah diketik jadi jatah otomatis', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(auth())
      .send({ target_weight_kg: 85, target_date: sebulanLagi });

    expect(res.status).toBe(201);
    expect(res.body.data.budget_manual).toBe(false);
    goalId = res.body.data.id as string;
    jatahAwal = res.body.data.daily_calorie_budget as number;
    expect(jatahAwal).toBe(res.body.data.plan.daily_calorie_budget);
    expect(res.body.data.plan.achievable).toBe(false);
  });

  it('jatah otomatis ikut turun saat berat turun, di goal dan di ringkasan harian', async () => {
    const timbang = await request(app)
      .post('/api/weight')
      .set(auth())
      .send({ weight_kg: 92, logged_at: todayInJakarta() });
    expect(timbang.status).toBe(201);
    beratHariIni = timbang.body.data.id as string;

    const [goal, harian] = await Promise.all([
      request(app).get('/api/goals/active').set(auth()),
      request(app).get('/api/summary/daily').set(auth()),
    ]);

    const jatahBaru = goal.body.data.daily_calorie_budget as number;
    expect(jatahBaru).toBeLessThan(jatahAwal);
    // Beranda, goal, dan kartu rencana menyebut angka yang sama.
    expect(jatahBaru).toBe(goal.body.data.plan.daily_calorie_budget);
    expect(harian.body.data.calorie_budget).toBe(jatahBaru);
  });

  it('jatah yang diketik user dikunci', async () => {
    const ubah = await request(app)
      .patch(`/api/goals/${goalId}`)
      .set(auth())
      .send({ daily_calorie_budget: 1800 });

    expect(ubah.status).toBe(200);
    expect(ubah.body.data.budget_manual).toBe(true);
    expect(ubah.body.data.daily_calorie_budget).toBe(1800);

    const koreksi = await request(app)
      .patch(`/api/weight/${beratHariIni}`)
      .set(auth())
      .send({ weight_kg: 90.5 });
    expect(koreksi.status).toBe(200);

    const harian = await request(app).get('/api/summary/daily').set(auth());
    expect(harian.body.data.calorie_budget).toBe(1800);
  });

  it('null mengembalikan ke jatah otomatis', async () => {
    const ubah = await request(app)
      .patch(`/api/goals/${goalId}`)
      .set(auth())
      .send({ daily_calorie_budget: null });

    expect(ubah.status).toBe(200);
    expect(ubah.body.data.budget_manual).toBe(false);
    expect(ubah.body.data.daily_calorie_budget).toBe(ubah.body.data.plan.daily_calorie_budget);
  });
});
