import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Olahraga repetisi lewat API sungguhan: form tidak pernah meminta menit
 * untuk push up, menitnya diturunkan backend, dan kalorinya kecil dengan
 * jujur.
 */

let app: Express;
let token: string;
let pushUpId: string;
let plankId: string;
let jalanId: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('reps'), password: 'RahasiaBanget123', name: 'Uji Repetisi' });
  token = daftar.body.data.access_token as string;

  await request(app).post('/api/users/me/profile').set(auth()).send({
    height_cm: 175,
    birth_date: '1995-06-15',
    gender: 'MALE',
    activity_level: 'SEDENTARY',
  });
  await request(app).post('/api/weight').set(auth()).send({ weight_kg: 80 });

  const lib = await request(app).get('/api/workouts/library').set(auth());
  const cari = (nama: string) =>
    (lib.body.data as { id: string; name: string; measure: string }[]).find((w) => w.name === nama);

  const pushUp = cari('Push Up');
  const plank = cari('Plank');
  const jalan = cari('Jalan Cepat');
  if (!pushUp || !plank || !jalan) throw new Error('library belum di-seed');

  expect(pushUp.measure).toBe('REPS');
  expect(plank.measure).toBe('HOLD');
  expect(jalan.measure).toBe('TIME');

  pushUpId = pushUp.id;
  plankId = plank.id;
  jalanId = jalan.id;
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe('olahraga repetisi', () => {
  it('push up 5 kali tanpa menit: tersimpan 0 menit, sekitar 2 kkal, set dan ulangannya utuh', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: pushUpId,
      reps: 5,
      intensity: 'MEDIUM',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.sets).toBe(1);
    expect(res.body.data.reps).toBe(5);
    expect(res.body.data.duration_minutes).toBe(0);
    // MET 8 -> 8,57 kkal/menit @70 kg; 15 detik; 80 kg: 8,57 x 0,25 x 80/70 = 2,4
    expect(res.body.data.calories_burned).toBe(2);
    expect(res.body.data.calories_source).toBe('MET');
  });

  it('3 set x 12 push up: menit diturunkan, kalori dari MET, beban opsional tersimpan', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: pushUpId,
      sets: 3,
      reps: 12,
      intensity: 'HIGH',
    });

    expect(res.status).toBe(201);
    // 36 ulangan x 3 detik = 108 detik = 1,8 menit -> disimpan 2
    expect(res.body.data.duration_minutes).toBe(2);
    // 8,57 x 1,8 x 80/70 = 17,6
    expect(res.body.data.calories_burned).toBe(18);
    expect(res.body.data.load_kg).toBeNull();
  });

  it('plank 3 x 45 detik memakai detik tahan, bukan ulangan', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: plankId,
      sets: 3,
      hold_seconds: 45,
      intensity: 'MEDIUM',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.hold_seconds).toBe(45);
    expect(res.body.data.reps).toBeNull();
    // 135 detik = 2,25 menit -> 2; 3,43 x 2,25 x 80/70 = 8,8
    expect(res.body.data.duration_minutes).toBe(2);
    expect(res.body.data.calories_burned).toBe(9);
  });

  it('olahraga waktu tetap seperti biasa, dengan menit', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: jalanId,
      duration_minutes: 30,
      intensity: 'MEDIUM',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.duration_minutes).toBe(30);
    expect(res.body.data.sets).toBeNull();
    // 4,90 x 30 x 80/70 = 168
    expect(res.body.data.calories_burned).toBe(168);
  });

  it('menolak ulangan dan detik tahan bersamaan, dan sesi tanpa ukuran sama sekali', async () => {
    const dua = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: pushUpId,
      sets: 2,
      reps: 10,
      hold_seconds: 30,
      intensity: 'LOW',
    });
    expect(dua.status).toBe(400);

    const kosong = await request(app)
      .post('/api/workouts')
      .set(auth())
      .send({ workout_library_id: pushUpId, intensity: 'LOW' });
    expect(kosong.status).toBe(400);
  });

  it('koreksi ulangan menghitung ulang menit dan kalori dari library, bukan menskalakan nol', async () => {
    const hari = await request(app).get('/api/workouts/today').set(auth());
    const lima = (hari.body.data.logs as { id: string; reps: number | null }[]).find(
      (l) => l.reps === 5,
    );
    expect(lima).toBeDefined();

    const ubah = await request(app)
      .patch(`/api/workouts/${lima?.id ?? ''}`)
      .set(auth())
      .send({ sets: 2, reps: 20, load_kg: 10 });

    expect(ubah.status).toBe(200);
    // 40 ulangan x 3 detik = 120 detik = 2 menit; 8,57 x 2 x 80/70 = 19,6
    expect(ubah.body.data.duration_minutes).toBe(2);
    expect(ubah.body.data.calories_burned).toBe(20);
    expect(ubah.body.data.load_kg).toBe('10.00');
    expect(ubah.body.data.calories_source).toBe('MET');
  });

  it('custom workout bisa memilih ukurannya', async () => {
    const custom = await request(app).post('/api/workouts/custom').set(auth()).send({
      name: 'Burpee',
      category: 'STRENGTH',
      calories_burned_per_minute: 10,
      measure: 'REPS',
    });
    expect(custom.status).toBe(201);
    expect(custom.body.data.measure).toBe('REPS');

    const log = await request(app)
      .post('/api/workouts')
      .set(auth())
      .send({
        custom_workout_id: custom.body.data.id as string,
        sets: 2,
        reps: 10,
        intensity: 'HIGH',
      });
    expect(log.status).toBe(201);
    // 20 x 3 detik = 1 menit; 10 x 1 x 80/70 = 11,4
    expect(log.body.data.duration_minutes).toBe(1);
    expect(log.body.data.calories_burned).toBe(11);
  });
});
