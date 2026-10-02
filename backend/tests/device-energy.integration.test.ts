import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { todayInJakarta } from '../src/utils/daily-key.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Aturan kalori smartwatch sejak rilis 1.2.0: kalori AKTIF jam DITAMBAHKAN ke
 * BMR x PAL hari itu, bersama olahraga yang tidak terekam jam. Olahraga yang
 * terekam jam tidak ditambahkan lagi, karena kalorinya sudah ada di angka
 * aktif. Angka total diubah dulu jadi aktif (total dikurangi BMR).
 *
 * Versi lama memakai angka jam sebagai PENGGANTI rumus, dan hari jamnya
 * dilepas jatuh ke sekitar BMR. Rumusnya ada di dailyCaloriesOut dan diuji
 * dengan angka pasti di calories.test.ts; di sini yang diuji penggabungan
 * filter dan agregasi di Directus sungguhan, bukan tiruan.
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

/** BMR user uji, dari baris kalori aktif yang tersimpan. Dipakai mengubah total jadi aktif. */
let bmrUji = 0;

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

    bmrUji = d.bmr_kcal as number;
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
  it('menambahkan kalori aktif jam ke BMR x PAL; angka total diubah dulu jadi aktif', async () => {
    const ringkasan = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: hariIni });

    const d = ringkasan.body.data;

    expect(d.calories_out_source).toBe('device');
    expect(d.device_kcal).toBe(2400);

    // Yang tersimpan angka TOTAL 2400, jadi aktifnya 2400 dikurangi BMR.
    expect(d.energy.device_active_kcal).toBe(2400 - bmrUji);
    // Belum ada olahraga: metabolisme dan pekerjaan ditambah aktif jam.
    expect(d.calories_out).toBe(d.energy.baseline + d.energy.device_active_kcal);
    // Metabolisme dan pekerjaan tidak lagi digantikan angka jam.
    expect(d.energy.baseline).toBeGreaterThan(bmrUji);
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

    // BMR x PAL + aktif jam + 350. Angka 90 dari jalan santai TIDAK ikut,
    // karena jam tangannya sudah melihatnya.
    expect(d.energy.workout_calories).toBe(350);
    expect(d.calories_out).toBe(d.energy.baseline + d.energy.device_active_kcal + 350);

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

    // Rumus faktorial: BMR dikali PAL, ditambah kalori bersih olahraga. Yang
    // penting di sini bukan angka pastinya, melainkan bahwa sumbernya sudah
    // berpindah dan hasilnya tetap masuk akal.
    expect(d.calories_out).toBeGreaterThan(2000);
    expect(d.calories_out).toBeLessThan(5000);
  });
});

/**
 * PEMBUKTIAN UNTUK KELUHAN NYATA, hari kemarin supaya terpisah dari state
 * describe di atas.
 *
 * Kondisi user: jam tangan cuma dipakai saat jalan kaki, dan jam itu HANYA
 * punya kalori aktif. Urutannya persis seperti yang dia lakukan:
 *   siang   catat jalan kaki, kalori diketik dari jam (180), centang terekam jam
 *   sore    catat renang tanpa jam, kalori dari MET library
 *   sore    pedometer mencatat 6.000 langkah, sebagian besar dari jalan tadi
 *   malam   isi kalori aktif jam seharian (420)
 *
 * Dulu jalan yang sama masuk TIGA kali: di kalori aktif jam, di kalori langkah,
 * dan sebagai olahraga versi MET karena tanda "terekam jam" belum bisa
 * dipasang sebelum angka harian ada. Sekarang hasilnya harus PERSIS
 * BMR x PAL + 420 + renang. Tidak ada satu kalori pun dari langkah maupun
 * dari jalan.
 */
describe('hari jalan kaki pakai jam, renang tanpa jam, langkah dari pedometer', () => {
  const kemarin = new Date(new Date(`${hariIni}T00:00:00Z`).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  let renangKcal = 0;

  it('jalan kaki: kalori dari jam diketik manual, ditandai MANUAL dan terekam jam', async () => {
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_name: 'Jalan kaki',
      duration_minutes: 30,
      calories_burned: 180,
      intensity: 'LOW',
      tracked_by_device: true,
      logged_at: kemarin,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.calories_burned).toBe(180);
    expect(res.body.data.calories_source).toBe('MANUAL');
    expect(res.body.data.tracked_by_device).toBe(true);
  });

  it('renang: dipilih dari library, kalori dihitung MET, tidak terekam jam', async () => {
    const library = await request(app).get('/api/workouts/library').set(auth());

    expect(library.status).toBe(200);
    expect(library.body.data.length).toBeGreaterThan(0);

    const item = library.body.data[0] as { id: string; name: string };

    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: item.id,
      duration_minutes: 40,
      intensity: 'HIGH',
      tracked_by_device: false,
      logged_at: kemarin,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.workout_name).toBe(item.name);
    expect(res.body.data.calories_source).toBe('MET');
    expect(res.body.data.calories_burned).toBeGreaterThan(0);

    renangKcal = res.body.data.calories_burned as number;
  });

  it('library juga bisa ditimpa angka manual tanpa kehilangan kaitan ke library', async () => {
    const library = await request(app).get('/api/workouts/library').set(auth());
    const item = library.body.data[0] as { id: string };

    // Dicatat ke tanggal lain supaya tidak mengganggu hitungan hari kemarin.
    const res = await request(app).post('/api/workouts').set(auth()).send({
      workout_library_id: item.id,
      duration_minutes: 40,
      calories_burned: 999,
      intensity: 'HIGH',
      logged_at: '2020-01-02',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.workout_library_id).toBe(item.id);
    expect(res.body.data.calories_burned).toBe(999);
    expect(res.body.data.calories_source).toBe('MANUAL');
  });

  it('langkah dari pedometer tercatat sebagai pantauan, tanpa kalori', async () => {
    const res = await request(app)
      .post('/api/steps')
      .set(auth())
      .send({ steps: 6000, logged_at: kemarin });

    expect(res.status).toBe(201);
    expect(res.body.data.steps).toBe(6000);
    // Kolomnya dicabut dari schema. Sampai migrasi bersihkan dijalankan di
    // database, kolom lamanya masih ada tapi kosong; setelahnya tidak ada.
    // Keduanya berarti hal yang sama: tidak ada kalori dari langkah.
    expect(res.body.data.calories_burned ?? null).toBeNull();
  });

  it('calories_out = BMR x PAL + aktif jam + renang, PERSIS, tanpa jalan dan tanpa langkah', async () => {
    const jam = await request(app)
      .post('/api/device-energy')
      .set(auth())
      .send({ active_kcal: 420, logged_at: kemarin });

    expect(jam.status).toBe(201);

    const bmr = jam.body.data.bmr_kcal as number;

    const ringkasan = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: kemarin });

    const d = ringkasan.body.data;

    expect(d.calories_out_source).toBe('device');
    expect(d.steps).toBe(6000);
    expect(d.energy.device_active_kcal).toBe(420);
    expect(d.energy.baseline).toBeGreaterThan(bmr);
    expect(d.calories_out).toBe(d.energy.baseline + 420 + renangKcal);

    // Rincian energi tidak lagi punya suku langkah sama sekali.
    expect(d.energy).not.toHaveProperty('step_calories');
  });

  it('tanpa angka jam, olahraga berceklis tetap dihitung, tidak hilang', async () => {
    const daftar = await request(app)
      .get('/api/device-energy')
      .set(auth())
      .query({ from: kemarin, to: kemarin });

    const hapus = await request(app)
      .delete(`/api/device-energy/${daftar.body.data[0].id as string}`)
      .set(auth());

    expect(hapus.status).toBe(200);

    const ringkasan = await request(app)
      .get('/api/summary/daily')
      .set(auth())
      .query({ date: kemarin });

    const d = ringkasan.body.data;

    expect(d.calories_out_source).toBe('formula');
    // Rumus: baseline + SEMUA olahraga (jalan 180 + renang), ceklis tidak
    // berpengaruh karena tidak ada angka perangkat yang sudah memuatnya.
    expect(d.calories_out).toBe(d.energy.baseline + 180 + renangKcal);
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
