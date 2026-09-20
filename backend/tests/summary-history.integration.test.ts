import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { todayInJakarta } from '../src/utils/daily-key.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Riwayat masuk vs keluar harus memberi angka yang SAMA dengan ringkasan
 * harian untuk hari yang sama. Kalau tidak, user melihat dua "kalori keluar"
 * berbeda untuk satu hari, dan halaman yang dibuat untuk mengontrol defisit
 * justru jadi sumber kebingungan.
 */

let app: Express;
let token: string;

const hariIni = todayInJakarta();
const kemarin = new Date(new Date(`${hariIni}T00:00:00Z`).getTime() - 86_400_000)
  .toISOString()
  .slice(0, 10);

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('history'), password: 'RahasiaBanget123', name: 'Uji Riwayat' });
  token = daftar.body.data.access_token as string;

  const profil = await request(app).post('/api/users/me/profile').set(auth()).send({
    height_cm: 175,
    birth_date: '1995-06-15',
    gender: 'MALE',
    activity_level: 'SEDENTARY',
  });
  const berat = await request(app).post('/api/weight').set(auth()).send({ weight_kg: 80 });
  if (profil.status !== 201 || berat.status !== 201) throw new Error('setup gagal');

  // Kemarin: makan dari kemasan (tanpa model), renang tanpa jam, angka jam.
  await request(app)
    .post('/api/food')
    .set(auth())
    .send({
      meal_type: 'LUNCH',
      logged_at: `${kemarin}T05:00:00.000Z`,
      items: [{ name: 'Indomie', portions: 2, unit: 'g', label: { kcal: 350 } }],
    });
  await request(app).post('/api/workouts').set(auth()).send({
    workout_name: 'Renang',
    duration_minutes: 40,
    calories_burned: 300,
    intensity: 'HIGH',
    tracked_by_device: false,
    logged_at: kemarin,
  });
  await request(app)
    .post('/api/device-energy')
    .set(auth())
    .send({ active_kcal: 400, logged_at: kemarin });

  // Hari ini: cuma makan, tanpa jam, jadi keluar dari rumus.
  await request(app)
    .post('/api/food')
    .set(auth())
    .send({
      meal_type: 'BREAKFAST',
      items: [{ name: 'Roti', portions: 1, unit: 'g', label: { kcal: 250 } }],
    });
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe('GET /api/summary/history', () => {
  it('memberi satu baris per hari, hari yang tidak dicatat ditandai bukan dibuang', async () => {
    const res = await request(app).get('/api/summary/history').set(auth()).query({ days: 7 });

    expect(res.status).toBe(200);
    expect(res.body.data.days).toHaveLength(7);
    expect(res.body.data.to).toBe(hariIni);

    const kosong = res.body.data.days.filter((d: { logged: boolean }) => !d.logged);
    expect(kosong.length).toBe(5);
  });

  it('angkanya sama dengan ringkasan harian untuk hari yang sama', async () => {
    const [riwayat, harianKemarin, harianIni] = await Promise.all([
      request(app).get('/api/summary/history').set(auth()).query({ days: 7 }),
      request(app).get('/api/summary/daily').set(auth()).query({ date: kemarin }),
      request(app).get('/api/summary/daily').set(auth()).query({ date: hariIni }),
    ]);

    interface Hari {
      date: string;
      calories_in: number;
      calories_out: number;
      calories_out_source: string;
      balance: number;
    }
    const hari = riwayat.body.data.days as Hari[];
    const cari = (tanggal: string) => hari.find((d) => d.date === tanggal);

    const k = cari(kemarin);
    if (!k) throw new Error('kemarin tidak ada di riwayat');
    expect(k.calories_in).toBe(700);
    expect(k.calories_out_source).toBe('device');
    expect(k.calories_out).toBe(harianKemarin.body.data.calories_out);
    expect(k.balance).toBe(k.calories_out - 700);

    const h = cari(hariIni);
    if (!h) throw new Error('hari ini tidak ada di riwayat');
    expect(h.calories_in).toBe(250);
    expect(h.calories_out_source).toBe('formula');
    expect(h.calories_out).toBe(harianIni.body.data.calories_out);
  });

  it('rata-rata dihitung dari hari yang tercatat saja', async () => {
    const res = await request(app).get('/api/summary/history').set(auth()).query({ days: 30 });
    const s = res.body.data.summary;

    expect(s.days_logged).toBe(2);
    expect(s.avg_calories_in).toBe(Math.round((700 + 250) / 2));
    // Keduanya defisit: keluar ribuan, masuk ratusan.
    expect(s.deficit_days).toBe(2);
    expect(s.avg_balance).toBeGreaterThan(0);
  });

  it('menolak rentang di luar 7 sampai 90 hari', async () => {
    const res = await request(app).get('/api/summary/history').set(auth()).query({ days: 365 });
    expect(res.status).toBe(400);
  });
});
