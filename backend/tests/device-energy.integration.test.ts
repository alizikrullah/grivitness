import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { todayInJakarta } from '../src/utils/daily-key.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Aturan paling penting dari fitur kalori smartwatch: angka perangkat
 * MENGGANTIKAN hitungan TDEE hari itu, bukan ditambahkan ke atasnya.
 *
 * Diuji ke Directus sungguhan, bukan tiruan, karena yang menentukan benar
 * tidaknya justru penggabungan filter dan agregasi di sisi Directus. Tiruan
 * hanya akan membuktikan bahwa kode ini setuju dengan dirinya sendiri.
 *
 * Ini kelas kesalahan yang sama dengan rumus lama `TDEE + olahraga + langkah`
 * yang sudah dibuang: menjumlahkan dua hal yang menghitung jam yang sama.
 * Kalau sampai kembali, defisit user terlihat jauh lebih besar daripada
 * kenyataan, dan itu persis yang membuat angka aplikasi ini tidak bisa
 * dipercaya.
 */

let app: Express;
let token: string;

const hariIni = todayInJakarta();

const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('device'), password: 'RahasiaBanget123', name: 'Uji Perangkat' });

  token = daftar.body.data.access_token as string;

  // Profil dan berat wajib ada, kalau tidak BMR-nya null dan seluruh
  // perhitungan energi ikut null sehingga tidak ada yang bisa dibandingkan.
  const profil = await request(app).post('/api/users/me/profile').set(auth()).send({
    height_cm: 175,
    birth_date: '1995-06-15',
    gender: 'MALE',
    activity_level: 'LIGHTLY_ACTIVE',
  });

  const berat = await request(app).post('/api/weight').set(auth()).send({ weight_kg: 80 });

  /**
   * Setup diperiksa keras di sini, bukan dibiarkan lewat.
   *
   * Tanpa profil dan berat, BMR bernilai null dan SELURUH perhitungan energi
   * ikut null. Test di bawah lalu gagal dengan pesan soal angka kalori, padahal
   * sebabnya ada di sini. Sekali kejadian, jejaknya menyesatkan cukup jauh.
   */
  if (profil.status !== 201 || berat.status !== 201) {
    throw new Error(
      `Setup gagal. Profil ${profil.status}: ${JSON.stringify(profil.body.error)}, ` +
        `berat ${berat.status}: ${JSON.stringify(berat.body.error)}`,
    );
  }
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe('POST /api/device-energy', () => {
  it('menolak angka di bawah BMR karena itu tanda "kalori aktif" yang salah ambil', async () => {
    // BMR pria 80kg, 175cm, sekitar 30 tahun kira-kira 1780 kkal. Angka 600
    // adalah tipikal "active calories" yang tersalin keliru.
    const res = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ total_kcal: 600, logged_at: hariIni });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/kalori aktif/i);
  });

  it('mengubah kalori aktif jadi total dengan menambahkan BMR', async () => {
    // Banyak jam tangan HANYA punya angka ini. Kalori aktif mengukur
    // pengeluaran di ATAS istirahat, jadi BMR adalah bagian yang justru belum
    // terhitung, bukan penjumlahan yang tumpang tindih.
    const res = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ active_kcal: 620, logged_at: hariIni });

    expect(res.status).toBe(201);

    const d = res.body.data;

    expect(d.active_kcal).toBe(620);

    // BMR-nya tidak dipatok angka mati supaya test tidak pecah sendiri saat
    // usia user uji bertambah setahun. Yang dijamin: nilainya masuk akal, dan
    // totalnya benar-benar hasil penjumlahan keduanya.
    expect(d.bmr_kcal).toBeGreaterThan(1500);
    expect(d.bmr_kcal).toBeLessThan(2100);
    expect(d.total_kcal).toBe(d.bmr_kcal + 620);
  });

  it('menolak kalau kedua angka dikirim sekaligus', async () => {
    const res = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ total_kcal: 2400, active_kcal: 620, logged_at: hariIni });

    expect(res.status).toBe(400);
  });

  it('menolak kalau tidak ada angka sama sekali', async () => {
    const res = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ source: 'Galaxy Watch', logged_at: hariIni });

    expect(res.status).toBe(400);
  });

  it('menyimpan angka yang wajar', async () => {
    const res = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ total_kcal: 2600, source: 'Galaxy Watch', logged_at: hariIni });

    expect(res.status).toBe(201);
    expect(res.body.data.total_kcal).toBe(2600);
  });

  it('mencatat ulang tanggal yang sama menimpa angkanya, bukan ditolak duplikat', async () => {
    const res = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ total_kcal: 2400, logged_at: hariIni });

    expect(res.status).toBe(201);
    expect(res.body.data.total_kcal).toBe(2400);

    // Menimpa entri yang tadinya hasil turunan harus ikut membersihkan jejaknya,
    // kalau tidak barisnya menyimpan dua cerita yang saling bertentangan.
    expect(res.body.data.active_kcal).toBeNull();
    expect(res.body.data.bmr_kcal).toBeNull();

    const daftar = await request(app)
      .get('/api/device-energy')
      .set(auth())
      .query({ from: hariIni, to: hariIni });

    // Satu baris per hari. Kalau upsert-nya gagal, di sini akan terlihat dua.
    expect(daftar.body.data).toHaveLength(1);
  });
});

describe('calories_out pada ringkasan harian', () => {
  it('memakai angka perangkat, bukan menjumlahkannya dengan hitungan rumus', async () => {
    const ringkasan = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: hariIni });

    const d = ringkasan.body.data;

    expect(d.calories_out_source).toBe('device');
    expect(d.device_kcal).toBe(2400);

    // Belum ada olahraga sama sekali, jadi angkanya harus persis angka
    // perangkat. Kalau rumusnya ikut dijumlahkan, nilainya akan melonjak ke
    // sekitar dua kali lipat.
    expect(d.calories_out).toBe(2400);
  });

  it('menambahkan HANYA olahraga yang tidak terekam jam tangan', async () => {
    // Terekam jam: kalorinya sudah ada di dalam 2400, jadi tidak boleh
    // ditambahkan lagi.
    const terekam = await request(app).post('/api/workouts').set(auth()).send({
      workout_name: 'Jalan santai',
      duration_minutes: 30,
      calories_burned: 90,
      intensity: 'LOW',
      tracked_by_device: true,
      logged_at: hariIni,
    });

    expect(terekam.status).toBe(201);

    // Tidak terekam jam, misalnya berenang. Ini yang memang harus ditambahkan.
    const luput = await request(app).post('/api/workouts').set(auth()).send({
      workout_name: 'Renang',
      duration_minutes: 40,
      calories_burned: 350,
      intensity: 'HIGH',
      tracked_by_device: false,
      logged_at: hariIni,
    });

    expect(luput.status).toBe(201);

    const ringkasan = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: hariIni });

    const d = ringkasan.body.data;

    // 2400 + 350. Angka 90 dari jalan santai TIDAK ikut, karena jam tangannya
    // sudah melihatnya.
    expect(d.calories_out).toBe(2750);

    // workout_calories tetap melaporkan seluruh olahraga apa adanya. Yang
    // disaring cuma yang masuk ke calories_out.
    expect(d.workout_calories).toBe(440);
  });

  it('kembali ke hitungan rumus setelah angka perangkat dihapus', async () => {
    const daftar = await request(app)
      .get('/api/device-energy')
      .set(auth())
      .query({ from: hariIni, to: hariIni });

    const id = daftar.body.data[0].id as string;

    const hapus = await request(app).delete(`/api/device-energy/${id}`).set(auth());
    expect(hapus.status).toBe(200);

    const ringkasan = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: hariIni });

    const d = ringkasan.body.data;

    expect(d.calories_out_source).toBe('formula');
    expect(d.device_kcal).toBeNull();

    // Rumus faktorial: BMR dikali PAL, ditambah kalori bersih langkah dan
    // olahraga. Yang penting di sini bukan angka pastinya, melainkan bahwa
    // sumbernya sudah berpindah dan hasilnya tetap masuk akal.
    expect(d.calories_out).toBeGreaterThan(2000);
    expect(d.calories_out).toBeLessThan(5000);
  });
});

describe('endpoint satu tanggal untuk riwayat layar catat', () => {
  it('membalas data hari yang diminta, bukan selalu hari ini', async () => {
    const res = await request(app).get('/api/weight/day').set(auth()).query({ date: hariIni });

    expect(res.status).toBe(200);
    expect(res.body.data.logged_at).toBe(hariIni);
  });

  it('membalas null untuk hari yang memang tidak ada catatannya', async () => {
    const res = await request(app).get('/api/weight/day').set(auth()).query({ date: '2020-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('menolak tanggal yang bentuknya salah', async () => {
    const res = await request(app).get('/api/weight/day').set(auth()).query({ date: '15 Agustus' });

    expect(res.status).toBe(400);
  });
});
