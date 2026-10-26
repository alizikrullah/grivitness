import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { caloriesFromWorkout, kcalPerMinuteWithIntensity } from '../src/utils/calories.js';
import { toNumber } from '../src/utils/number.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Intensitas olahraga lewat API sungguhan: porsi waktu bergerak mengubah
 * kalori MET untuk olahraga berukuran menit, tidak menyentuh kalori yang
 * diketik user, dan diabaikan untuk olahraga berukuran set.
 */

let app: Express;
let token: string;
let renang: { id: string; perMenit: number };
let pushUp: string;

const BERAT = 80;
const auth = () => ({ Authorization: `Bearer ${token}` });

const cariLibrary = async (nama: string) => {
  const res = await request(app).get('/api/workouts/library').set(auth()).query({ search: nama });
  const baris = (
    res.body.data as { id: string; name: string; calories_burned_per_minute: string }[]
  ).find((b) => b.name === nama);
  if (!baris) throw new Error(`library ${nama} tidak ada`);
  return baris;
};

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('intensitas'), password: 'RahasiaBanget123', name: 'Uji Intensitas' });
  token = daftar.body.data.access_token as string;

  const berat = await request(app)
    .post('/api/weight')
    .set(auth())
    .send({ weight_kg: BERAT, logged_at: '2020-03-01' });
  if (berat.status !== 201) throw new Error('setup berat gagal');

  const baris = await cariLibrary('Renang');
  renang = { id: baris.id, perMenit: toNumber(baris.calories_burned_per_minute) };
  pushUp = (await cariLibrary('Push Up')).id;
});

afterAll(async () => {
  await cleanupTestUsers();
});

const harapan = (menit: number, intensitas: 'LOW' | 'MEDIUM' | 'HIGH' | null) =>
  caloriesFromWorkout(kcalPerMinuteWithIntensity(renang.perMenit, intensitas), menit, BERAT);

describe('intensitas olahraga', () => {
  let sesi = '';

  it('sedang: 75% waktu bergerak', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: renang.id,
      duration_minutes: 60,
      intensity: 'MEDIUM',
      logged_at: '2020-03-02',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.intensity).toBe('MEDIUM');
    expect(res.body.data.calories_burned).toBe(harapan(60, 'MEDIUM'));
    expect(res.body.data.calories_burned).toBeLessThan(harapan(60, null));
    sesi = res.body.data.id as string;
  });

  it('tanpa intensitas tetap seperti dulu: dianggap bergerak terus', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: renang.id,
      duration_minutes: 60,
      logged_at: '2020-03-03',
    });

    expect(res.body.data.intensity).toBeNull();
    expect(res.body.data.calories_burned).toBe(harapan(60, null));
  });

  it('mengubah intensitas saja menghitung ulang kalorinya', async () => {
    const res = await request(app)
      .patch(`/api/workouts/${sesi}`)
      .set(auth())
      .send({ intensity: 'LOW' });

    expect(res.status).toBe(200);
    expect(res.body.data.intensity).toBe('LOW');
    expect(res.body.data.calories_burned).toBe(harapan(60, 'LOW'));
  });

  it('kalori yang diketik user tidak disentuh intensitas', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: renang.id,
      duration_minutes: 45,
      intensity: 'LOW',
      calories_burned: 420,
      logged_at: '2020-03-04',
    });

    expect(res.body.data.calories_burned).toBe(420);
    expect(res.body.data.calories_source).toBe('MANUAL');
  });

  it('olahraga berukuran set mengabaikan intensitas', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: pushUp,
      sets: 3,
      reps: 10,
      intensity: 'HIGH',
      logged_at: '2020-03-05',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.intensity).toBeNull();
  });
});
