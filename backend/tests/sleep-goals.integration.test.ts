import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { todayInJakarta } from '../src/utils/daily-key.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Aturan tidur dan jatah yang hidup di data sungguhan: tidur yang bertabrakan
 * ditolak, malam yang terpotong masuk satu tanggal, jam bangun yang belum
 * terjadi ditolak, dan jatah kalori otomatis mengikuti berat terbaru
 * sementara jatah manual dikunci.
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

/** Tanggal 2020 supaya tidak bertemu data lain. */
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
 * Kasus nyata 28 ke 29 Sep 2026, dipindah ke Okt 2020: tidur 21.00, kebangun
 * 23.00, tidur lagi 02.00 sampai 04.20. Dulu potongan pertama jatuh ke
 * tanggal lain dari potongan keduanya.
 */
describe('malam yang terpotong', () => {
  const tidur = (start: string, end: string) =>
    request(app)
      .post('/api/sleep')
      .set(auth())
      .send({ sleep_start: start, sleep_end: end, quality_score: 3 });

  it('kedua potongan dan tidur siangnya masuk tanggal yang sama', async () => {
    // 5 Okt 21.00 sampai 23.00 WIB, 6 Okt 02.00 sampai 04.20 WIB, 6 Okt 14.30 sampai 15.30 WIB.
    const hasil = await Promise.all([
      tidur('2020-10-05T14:00:00.000Z', '2020-10-05T16:00:00.000Z'),
      tidur('2020-10-05T19:00:00.000Z', '2020-10-05T21:20:00.000Z'),
      tidur('2020-10-06T07:30:00.000Z', '2020-10-06T08:30:00.000Z'),
    ]);
    for (const res of hasil) {
      expect(res.status).toBe(201);
      expect(res.body.data.logged_at).toBe('2020-10-06');
    }

    const hari = await request(app).get('/api/sleep/day').set(auth()).query({ date: '2020-10-06' });
    expect(hari.body.data.logs).toHaveLength(3);
    expect(hari.body.data.total_minutes).toBe(120 + 140 + 60);

    const malamSebelumnya = await request(app)
      .get('/api/sleep/day')
      .set(auth())
      .query({ date: '2020-10-05' });
    expect(malamSebelumnya.body.data.logs).toHaveLength(0);
  });

  it('mengubah jam mulai ikut memindah tanggalnya', async () => {
    // 7 Okt 16.00 sampai 17.00 WIB: tidur sore, tanggal 7.
    const sore = await tidur('2020-10-07T09:00:00.000Z', '2020-10-07T10:00:00.000Z');
    expect(sore.body.data.logged_at).toBe('2020-10-07');

    // Dipindah ke 19.00 sampai 20.00 WIB: sudah malam, ikut tidur tanggal 8.
    const res = await request(app)
      .patch(`/api/sleep/${sore.body.data.id as string}`)
      .set(auth())
      .send({ sleep_start: '2020-10-07T12:00:00.000Z', sleep_end: '2020-10-07T13:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(res.body.data.logged_at).toBe('2020-10-08');
  });
});

describe('jam bangun yang belum terjadi', () => {
  const sejam = 3_600_000;

  it('ditolak saat mencatat', async () => {
    const res = await request(app)
      .post('/api/sleep')
      .set(auth())
      .send({
        sleep_start: new Date(Date.now() - sejam).toISOString(),
        sleep_end: new Date(Date.now() + 2 * sejam).toISOString(),
        quality_score: 3,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('belum terjadi');
  });

  it('ditolak saat mengubah jamnya, tapi skor saja tetap bisa diubah', async () => {
    const lama = await request(app).post('/api/sleep').set(auth()).send({
      sleep_start: '2020-10-10T15:00:00.000Z',
      sleep_end: '2020-10-10T22:00:00.000Z',
      quality_score: 3,
    });
    expect(lama.status).toBe(201);
    const id = lama.body.data.id as string;

    const maju = await request(app)
      .patch(`/api/sleep/${id}`)
      .set(auth())
      .send({
        sleep_start: new Date(Date.now() - sejam).toISOString(),
        sleep_end: new Date(Date.now() + 2 * sejam).toISOString(),
      });
    expect(maju.status).toBe(400);

    const skor = await request(app)
      .patch(`/api/sleep/${id}`)
      .set(auth())
      .send({ quality_score: 5 });
    expect(skor.status).toBe(200);
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
