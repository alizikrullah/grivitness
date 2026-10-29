import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { caloriesFromWorkout, metFromSpeed, netKcalPerMinuteAt70 } from '../src/utils/calories.js';
import { todayInJakarta } from '../src/utils/daily-key.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Rilis 1.4.0 lewat API sungguhan: tanda sakit sebagai rentang, sesi lari
 * dari screenshot (pace, HR, kalori TOTAL), MET dari kecepatan untuk lari
 * tanpa angka kalori, dan Lari/Jalan yang sudah digabung.
 */

let app: Express;
let token: string;
let tokenLain: string;
let lariId: string;
let bmr: number;

const BERAT = 80;
const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

const geser = (tanggal: string, hari: number): string =>
  new Date(new Date(`${tanggal}T00:00:00Z`).getTime() + hari * 86_400_000)
    .toISOString()
    .slice(0, 10);

const HARI_INI = todayInJakarta();
const TANGGAL_LARI = '2020-03-10';
const TANGGAL_KOSONG = '2020-03-11';

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const [satu, dua] = await Promise.all([
    request(app)
      .post('/api/auth/register')
      .send({
        email: testEmail('sakitlari'),
        password: 'RahasiaBanget123',
        name: 'Uji Sakit Lari',
      }),
    request(app)
      .post('/api/auth/register')
      .send({ email: testEmail('sakitlain'), password: 'RahasiaBanget123', name: 'Uji Lain' }),
  ]);
  token = satu.body.data.access_token as string;
  tokenLain = dua.body.data.access_token as string;

  await request(app).post('/api/users/me/profile').set(auth()).send({
    height_cm: 175,
    birth_date: '1995-06-15',
    gender: 'MALE',
    activity_level: 'SEDENTARY',
  });
  await request(app).post('/api/weight').set(auth()).send({ weight_kg: BERAT });

  const profil = await request(app).get('/api/users/me/profile').set(auth());
  bmr = profil.body.data.bmr as number;

  const lib = await request(app).get('/api/workouts/library').set(auth());
  const baris = lib.body.data as { id: string; name: string; distance_kind: string | null }[];
  const lari = baris.find((b) => b.name === 'Lari');
  if (!lari) throw new Error('library belum di-seed: Lari tidak ada');
  lariId = lari.id;
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe('library lari dan jalan', () => {
  it('Lari dan Jalan bertanda jenis jarak, yang Cepat tidak ditawarkan lagi', async () => {
    const res = await request(app).get('/api/workouts/library').set(auth());
    const baris = res.body.data as { name: string; distance_kind: string | null }[];

    expect(baris.find((b) => b.name === 'Lari')?.distance_kind).toBe('RUN');
    expect(baris.find((b) => b.name === 'Jalan')?.distance_kind).toBe('WALK');
    expect(baris.some((b) => b.name === 'Lari Cepat' || b.name === 'Jalan Cepat')).toBe(false);
  });
});

describe('sesi lari dari screenshot', () => {
  it('menyimpan pace apa adanya, durasi detik, HR, dan kalori TOTAL sebagai MANUAL', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: lariId,
      duration_seconds: 2685,
      distance_km: 3.92,
      pace_seconds_per_km: 684,
      avg_hr: 156,
      avg_cadence: 140,
      step_count: 6273,
      training_effect: 3.1,
      started_at: '2020-03-10T04:51:00+07:00',
      calories_burned: 360,
      tracked_by_device: true,
      logged_at: TANGGAL_LARI,
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      workout_name: 'Lari',
      duration_minutes: 45,
      duration_seconds: 2685,
      distance_km: '3.92',
      pace_seconds_per_km: 684,
      avg_hr: 156,
      avg_cadence: 140,
      step_count: 6273,
      calories_burned: 360,
      calories_source: 'MANUAL',
      tracked_by_device: true,
      distance_kind: 'RUN',
    });
  });

  it('daftar olahraga ikut membawa jenis jaraknya', async () => {
    const res = await request(app)
      .get('/api/workouts')
      .set(auth())
      .query({ from: TANGGAL_LARI, to: TANGGAL_LARI });

    expect(res.status).toBe(200);
    expect(res.body.data[0].distance_kind).toBe('RUN');
  });

  it('kalori total: menit sesi keluar dari partisi, jadi metabolisme lebih kecil', async () => {
    const [denganLari, kosong] = await Promise.all([
      request(app).get('/api/summary/daily').set(auth()).query({ date: TANGGAL_LARI }),
      request(app).get('/api/summary/daily').set(auth()).query({ date: TANGGAL_KOSONG }),
    ]);
    const a = denganLari.body.data;
    const b = kosong.body.data;

    // Tanpa angka jam: semua olahraga dijumlah, angkanya tetap 360.
    expect(a.energy.workout_calories).toBe(360);
    expect(a.calories_out).toBe(a.energy.baseline + 360);

    // 45 menit yang ditanggung angka total tidak dibayar PAR apa pun, dan
    // tetap mengurangi sisa hari: selisihnya BMR x 45 x 1,6 / 1.440.
    expect(b.energy.baseline - a.energy.baseline).toBeCloseTo((bmr * 45 * 1.6) / 1440, -1);
  });
});

describe('lari tanpa angka kalori: MET dari kecepatan', () => {
  let id: string;

  it('5 km dalam 30 menit dihitung dari 10 km/jam, intensitas diabaikan', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: lariId,
      duration_seconds: 1800,
      distance_km: 5,
      intensity: 'LOW',
      logged_at: '2020-03-12',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.calories_source).toBe('MET');
    expect(res.body.data.pace_seconds_per_km).toBe(360);
    expect(res.body.data.intensity).toBeNull();
    expect(res.body.data.calories_burned).toBe(
      caloriesFromWorkout(netKcalPerMinuteAt70(metFromSpeed('RUN', 10)), 30, BERAT),
    );
    id = res.body.data.id as string;
  });

  it('jarak dikoreksi: pace dan kalori dihitung ulang dari kecepatan baru', async () => {
    const res = await request(app).patch(`/api/workouts/${id}`).set(auth()).send({
      distance_km: 6,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.pace_seconds_per_km).toBe(300);
    expect(res.body.data.calories_burned).toBe(
      caloriesFromWorkout(netKcalPerMinuteAt70(metFromSpeed('RUN', 12)), 30, BERAT),
    );
  });
});

describe('scan screenshot', () => {
  it('tanpa gambar ditolak sebelum menyentuh model', async () => {
    const res = await request(app).post('/api/workouts/scan').set(auth());

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('minimal satu screenshot');
  });
});

describe('tanda sakit', () => {
  const awal = geser(HARI_INI, -3);
  const kemarin = geser(HARI_INI, -1);

  it('menyalakan di hari pertama memulai rentang yang terus berlaku', async () => {
    const res = await request(app)
      .put('/api/sick-periods/day')
      .set(auth())
      .send({ date: awal, sick: true });

    expect(res.status).toBe(200);
    expect(res.body.data.sick).toMatchObject({ start_date: awal, end_date: null });

    const hariIni = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: HARI_INI });
    expect(hariIni.body.data.sick).toMatchObject({ start_date: awal, end_date: null });
  });

  it('mematikan di hari ini berarti sembuh hari ini, rentangnya berakhir kemarin', async () => {
    const res = await request(app)
      .put('/api/sick-periods/day')
      .set(auth())
      .send({ date: HARI_INI, sick: false });

    expect(res.status).toBe(200);
    expect(res.body.data.sick).toBeNull();

    const [hariIni, sebelum] = await Promise.all([
      request(app).get('/api/summary/daily').set(auth()).query({ date: HARI_INI }),
      request(app).get('/api/summary/daily').set(auth()).query({ date: kemarin }),
    ]);
    expect(hariIni.body.data.sick).toBeNull();
    expect(sebelum.body.data.sick).toMatchObject({ start_date: awal, end_date: kemarin });
  });

  it('tanggal yang belum terjadi ditolak', async () => {
    const res = await request(app)
      .put('/api/sick-periods/day')
      .set(auth())
      .send({ date: geser(HARI_INI, 2), sick: true });

    expect(res.status).toBe(400);
  });

  it('rentang sakit tidak bocor ke user lain', async () => {
    const [punyaSendiri, punyaOrang] = await Promise.all([
      request(app).get('/api/sick-periods').set(auth()).query({ from: awal, to: HARI_INI }),
      request(app)
        .get('/api/sick-periods')
        .set(auth(tokenLain))
        .query({ from: awal, to: HARI_INI }),
    ]);

    expect(punyaSendiri.body.data).toHaveLength(1);
    expect(punyaOrang.body.data).toHaveLength(0);
  });
});
