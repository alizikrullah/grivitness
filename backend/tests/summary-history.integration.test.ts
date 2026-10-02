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
      // Gula ikut diisi: kemasan tanpa gula membuat model ditanya gulanya,
      // dan test otomatis tidak boleh bergantung pada Groq.
      items: [{ name: 'Indomie', portions: 2, unit: 'g', label: { kcal: 350, sugar_g: 7 } }],
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
      items: [{ name: 'Roti', portions: 1, unit: 'g', label: { kcal: 250, sugar_g: 5 } }],
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

/**
 * Hari yang user tandai "belum lengkap" tetap tampil, tapi seperti hari tanpa
 * catatan, tidak ikut rata-rata. Separuh catatan bukan separuh makan.
 */
describe('hari yang ditandai belum lengkap', () => {
  it('dikeluarkan dari rata-rata riwayat, tetap tampil dengan tandanya', async () => {
    const tandai = await request(app)
      .put('/api/food/day-status')
      .set(auth())
      .send({ date: kemarin, status: 'INCOMPLETE' });
    expect(tandai.status).toBe(200);

    const res = await request(app).get('/api/summary/history').set(auth()).query({ days: 7 });
    const s = res.body.data.summary;
    const k = (res.body.data.days as { date: string; incomplete: boolean; logged: boolean }[]).find(
      (d) => d.date === kemarin,
    );

    expect(k?.logged).toBe(true);
    expect(k?.incomplete).toBe(true);
    expect(s.days_logged).toBe(1);
    expect(s.days_incomplete).toBe(1);
    expect(s.avg_calories_in).toBe(250);
  });

  it('ikut dikeluarkan dari rata-rata mingguan', async () => {
    const res = await request(app).get('/api/summary/weekly').set(auth()).query({ from: kemarin });

    expect(res.body.data.food_days).toBe(1);
    expect(res.body.data.food_days_incomplete).toBe(1);
    expect(res.body.data.avg_calories_in).toBe(250);
  });

  it('jawaban bisa diubah: memang segini membuatnya ikut rata-rata lagi', async () => {
    const ubah = await request(app)
      .put('/api/food/day-status')
      .set(auth())
      .send({ date: kemarin, status: 'COMPLETE' });
    expect(ubah.status).toBe(200);

    const res = await request(app).get('/api/summary/history').set(auth()).query({ days: 7 });
    expect(res.body.data.summary.days_logged).toBe(2);
    expect(res.body.data.summary.days_incomplete).toBe(0);
  });

  it('menolak tanggal yang belum terjadi', async () => {
    const besok = new Date(new Date(`${hariIni}T00:00:00Z`).getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const res = await request(app)
      .put('/api/food/day-status')
      .set(auth())
      .send({ date: besok, status: 'INCOMPLETE' });
    expect(res.status).toBe(400);
  });
});

describe('ringkasan harian: gula dan pertanyaan hari makan', () => {
  it('menjumlahkan gula hari itu dan mengirim batasnya', async () => {
    const res = await request(app).get('/api/summary/daily').set(auth()).query({ date: kemarin });

    expect(res.body.data.sugar_g).toBe(14);
    expect(res.body.data.targets.sugar_max_g).toBeGreaterThan(0);
    expect(res.body.data.targets.sugar_max_g).toBeLessThanOrEqual(50);
  });
});

describe('GET /api/summary/calendar', () => {
  it('menandai tanggal yang ada datanya untuk SATU layar saja', async () => {
    const dari = new Date(new Date(`${hariIni}T00:00:00Z`).getTime() - 10 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    const [makan, olahraga, tidur] = await Promise.all([
      request(app)
        .get('/api/summary/calendar')
        .set(auth())
        .query({ type: 'food', from: dari, to: hariIni }),
      request(app)
        .get('/api/summary/calendar')
        .set(auth())
        .query({ type: 'workout', from: dari, to: hariIni }),
      request(app)
        .get('/api/summary/calendar')
        .set(auth())
        .query({ type: 'sleep', from: dari, to: hariIni }),
    ]);

    expect(makan.status).toBe(200);
    expect(makan.body.data.dates).toEqual([kemarin, hariIni]);
    expect(olahraga.body.data.dates).toEqual([kemarin]);
    expect(tidur.body.data.dates).toEqual([]);
  });

  it('menandai hari makan yang belum lengkap terpisah', async () => {
    await request(app)
      .put('/api/food/day-status')
      .set(auth())
      .send({ date: kemarin, status: 'INCOMPLETE' });

    const res = await request(app)
      .get('/api/summary/calendar')
      .set(auth())
      .query({ type: 'food', from: kemarin, to: hariIni });

    expect(res.body.data.incomplete).toEqual([kemarin]);
  });

  it('menolak jenis yang tidak dikenal dan rentang yang terlalu panjang', async () => {
    const jenis = await request(app)
      .get('/api/summary/calendar')
      .set(auth())
      .query({ type: 'gaji', from: kemarin, to: hariIni });
    const panjang = await request(app)
      .get('/api/summary/calendar')
      .set(auth())
      .query({ type: 'food', from: '2025-01-01', to: hariIni });

    expect(jenis.status).toBe(400);
    expect(panjang.status).toBe(400);
  });
});
