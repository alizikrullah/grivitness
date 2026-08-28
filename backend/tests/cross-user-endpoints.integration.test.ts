import type { Express } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { forUser } from '../src/data/scoped.js';
import { dailyKey, todayInJakarta } from '../src/utils/daily-key.js';
import { removeFileSafely, uploadWebP } from '../src/utils/directus-files.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Membuktikan data satu user TIDAK PERNAH sampai ke user lain, diuji lewat
 * HTTP sungguhan pada setiap endpoint, bukan lewat lapisan repository.
 *
 * Bedanya penting. scoped-access.integration.test.ts sudah membuktikan forUser()
 * rapat, tapi itu menguji abstraksinya. Satu module yang lupa memakai forUser
 * dan menembak SDK langsung akan tetap lolos di sana, sementara endpoint-nya
 * bocor. Berkas ini menutup celah itu: yang diserang adalah pintu yang benar
 * benar terbuka ke internet.
 *
 * Polanya sama di semua kasus. User A menyimpan data, lalu user B mencoba
 * membacanya, mengubahnya, dan menghapusnya sambil membawa id milik A.
 */

let app: Express;
let A: { id: string; token: string };
let B: { id: string; token: string };

const hariIni = todayInJakarta();

/** Id baris milik A, dikumpulkan saat penyemaian untuk dipakai menyerang. */
const milikA: Record<string, string> = {};

/** Berkas sungguhan di Directus storage, disapu sendiri di akhir. */
const fileTerunggah: string[] = [];

/**
 * Mengunggah berkas SUNGGUHAN ke Directus storage.
 *
 * directus_file_id adalah foreign key betulan, jadi uuid karangan ditolak.
 * Lebih penting lagi: dengan kolom itu dibiarkan null, assertFileOwned tidak
 * menemukan baris apa pun dan SEMUA orang dapat 404, termasuk pemiliknya
 * sendiri. Test-nya lalu lulus tanpa membuktikan apa pun.
 */
const unggahBerkasUji = async (nama: string): Promise<string> => {
  const webp = await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 120, g: 120, b: 120 } },
  })
    .webp()
    .toBuffer();

  const file = await uploadWebP(webp, nama, 'Berkas uji lintas user');
  fileTerunggah.push(file.id);

  return file.id;
};

const daftar = async (label: string): Promise<{ id: string; token: string }> => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail(label), password: 'RahasiaBanget123', name: 'Uji ' + label });

  if (res.status !== 201) {
    throw new Error(`Registrasi ${label} gagal ${res.status}: ${JSON.stringify(res.body.error)}`);
  }

  return { id: res.body.data.user.id as string, token: res.body.data.access_token as string };
};

const sebagai = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  A = await daftar('lintasA');
  B = await daftar('lintasB');

  /*
    Sebagian besar data A ditanam lewat endpoint sungguhan, supaya bentuk
    payload-nya dijamin sah dan jalur pembuatannya ikut teruji.
  */
  const buat = async (jalur: string, isi: Record<string, unknown>): Promise<string> => {
    const res = await request(app).post(jalur).set(sebagai(A)).send(isi);

    if (res.status !== 201) {
      throw new Error(`Semai ${jalur} gagal ${res.status}: ${JSON.stringify(res.body.error)}`);
    }

    return res.body.data.id as string;
  };

  milikA.weight = await buat('/api/weight', { weight_kg: 80, logged_at: hariIni });
  milikA.steps = await buat('/api/steps', { steps: 9000, logged_at: hariIni });
  milikA.mood = await buat('/api/mood', { mood_score: 5, energy_score: 5, logged_at: hariIni });
  milikA.water = await buat('/api/water', { amount_ml: 500 });
  milikA.measurements = await buat('/api/measurements', { waist_cm: 88, logged_at: hariIni });
  milikA.deviceEnergy = await buat('/api/device-energy', {
    total_kcal: 2600,
    logged_at: hariIni,
  });

  milikA.sleep = await buat('/api/sleep', {
    sleep_start: `${hariIni}T15:00:00.000Z`,
    sleep_end: `${hariIni}T22:30:00.000Z`,
    quality_score: 4,
  });

  milikA.workout = await buat('/api/workouts', {
    workout_name: 'Lari pagi',
    duration_minutes: 30,
    calories_burned: 300,
    intensity: 'MEDIUM',
    logged_at: hariIni,
  });

  milikA.customWorkout = await buat('/api/workouts/custom', {
    name: 'Senam rahasia A',
    category: 'CARDIO',
    calories_burned_per_minute: 8,
  });

  // daily_calorie_budget diisi eksplisit karena A sengaja tidak punya profil di
  // test ini, dan tanpa profil backend menolak menghitungnya sendiri.
  milikA.goal = await buat('/api/goals', {
    target_weight_kg: 70,
    target_date: '2027-01-01',
    daily_calorie_budget: 2000,
  });

  /*
    food_logs dan body_photos ditanam LANGSUNG, bukan lewat endpoint.

    Keduanya memanggil Groq saat dibuat, dan menyeret analisa AI ke dalam test
    keamanan berarti test ini ikut gagal setiap kali kuota Groq penuh. Yang
    diuji di sini kepemilikan data, bukan jalur unggahnya.
  */
  const repoA = forUser(A.id);

  milikA.fileMakanan = await unggahBerkasUji('lintas-makan.webp');
  const makanan = await repoA.create('food_logs', {
    photo_url: `/api/files/${milikA.fileMakanan}`,
    directus_file_id: milikA.fileMakanan,
    meal_type: 'LUNCH',
    ai_analysis: { items: [], confidence: 'low' },
    total_calories: 777,
    protein_g: '30.00',
    carbs_g: '80.00',
    fat_g: '20.00',
    notes: null,
    logged_at: new Date().toISOString(),
  });
  milikA.food = makanan.id;

  milikA.fileDepan = await unggahBerkasUji('lintas-depan.webp');
  const fileSamping = await unggahBerkasUji('lintas-samping.webp');

  const fotoBadan = await repoA.create('body_photos', {
    front_photo_url: `/api/files/${milikA.fileDepan}`,
    side_photo_url: `/api/files/${fileSamping}`,
    front_directus_file_id: milikA.fileDepan,
    side_directus_file_id: fileSamping,
    ai_analysis: { posture_notes: 'rahasia A' },
    logged_at: hariIni,
    user_date_key: dailyKey(A.id, hariIni),
  });
  milikA.bodyPhoto = fotoBadan.id;

  /*
    Percakapan ditanam langsung juga, karena POST /api/chat memanggil Groq.
    Yang diuji di sini kepemilikan riwayatnya, bukan jalur balasan modelnya.
  */
  const pesan = await repoA.create('chat_messages', {
    role: 'USER',
    content: 'rahasia percakapan milik A',
  });
  milikA.chat = pesan.id;
});

afterAll(async () => {
  // Berkas di storage TIDAK ikut terhapus saat user dihapus, jadi disapu
  // sendiri di sini supaya tidak menumpuk jadi berkas yatim.
  await Promise.all(fileTerunggah.map((id) => removeFileSafely(id)));
  await cleanupTestUsers();
});

/**
 * Endpoint yang membalas SATU baris untuk satu tanggal.
 *
 * B mencatat apa pun di tanggal yang sama, jadi yang diuji bukan sekadar
 * "balasannya kosong", melainkan bahwa yang terbaca benar-benar punya B.
 */
describe('membaca satu tanggal', () => {
  const kasus = [
    { nama: 'berat', jalur: '/api/weight/day' },
    { nama: 'langkah', jalur: '/api/steps/day' },
    { nama: 'mood', jalur: '/api/mood/day' },
    { nama: 'ukuran badan', jalur: '/api/measurements/day' },
    { nama: 'kalori perangkat', jalur: '/api/device-energy/day' },
    { nama: 'foto badan', jalur: '/api/body-photos/day' },
  ];

  for (const { nama, jalur } of kasus) {
    it(`${nama} milik A tidak terlihat oleh B`, async () => {
      const res = await request(app).get(jalur).set(sebagai(B)).query({ date: hariIni });

      expect(res.status).toBe(200);
      // Null berarti B memang belum mencatat apa pun di tanggal itu. Yang
      // dilarang keras adalah balasan berisi baris milik A.
      expect(res.body.data).toBeNull();
    });
  }

  it('makanan milik A tidak terlihat oleh B', async () => {
    const res = await request(app).get('/api/food').set(sebagai(B)).query({ date: hariIni });

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(0);
    expect(res.body.data.total_calories).toBe(0);
  });

  it('minum milik A tidak terlihat oleh B', async () => {
    const res = await request(app).get('/api/water').set(sebagai(B)).query({ date: hariIni });

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(0);
    expect(res.body.data.total_ml).toBe(0);
  });

  it('tidur milik A tidak terlihat oleh B', async () => {
    const res = await request(app).get('/api/sleep/day').set(sebagai(B)).query({ date: hariIni });

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(0);
    expect(res.body.data.total_minutes).toBe(0);
  });

  it('olahraga milik A tidak terlihat oleh B', async () => {
    const res = await request(app)
      .get('/api/workouts/day')
      .set(sebagai(B))
      .query({ date: hariIni });

    expect(res.status).toBe(200);
    expect(res.body.data.logs).toHaveLength(0);
    expect(res.body.data.total_calories).toBe(0);
  });
});

describe('membaca rentang tanggal', () => {
  const kasus = [
    { nama: 'berat', jalur: '/api/weight' },
    { nama: 'langkah', jalur: '/api/steps' },
    { nama: 'tidur', jalur: '/api/sleep' },
    { nama: 'mood', jalur: '/api/mood' },
    { nama: 'ukuran badan', jalur: '/api/measurements' },
    { nama: 'olahraga', jalur: '/api/workouts' },
    { nama: 'kalori perangkat', jalur: '/api/device-energy' },
    { nama: 'foto badan', jalur: '/api/body-photos' },
  ];

  for (const { nama, jalur } of kasus) {
    it(`riwayat ${nama} milik B tidak memuat baris milik A`, async () => {
      const res = await request(app)
        .get(jalur)
        .set(sebagai(B))
        .query({ from: '2020-01-01', to: hariIni });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  }

  it('daftar goal dan custom workout milik B tidak memuat milik A', async () => {
    const [goals, custom] = await Promise.all([
      request(app).get('/api/goals').set(sebagai(B)),
      request(app).get('/api/workouts/custom').set(sebagai(B)),
    ]);

    expect(goals.body.data).toEqual([]);
    expect(custom.body.data).toEqual([]);

    const aktif = await request(app).get('/api/goals/active').set(sebagai(B));
    expect(aktif.body.data).toBeNull();
  });
});

/**
 * Serangan yang paling langsung: B sudah tahu id baris milik A, entah dari mana,
 * lalu memakainya apa adanya.
 */
describe('mengubah dan menghapus dengan id milik user lain', () => {
  /*
    Nilai isiannya sengaja SAH semua. Angka di luar rentang akan ditolak Zod
    dengan 400 sebelum pemeriksaan kepemilikan sempat berjalan, dan test-nya
    lulus tanpa pernah menguji otorisasi sama sekali.
  */
  const bisaDiubah = [
    { nama: 'berat', jalur: '/api/weight', kunci: 'weight', isi: { weight_kg: 55 } },
    { nama: 'langkah', jalur: '/api/steps', kunci: 'steps', isi: { steps: 1000 } },
    { nama: 'mood', jalur: '/api/mood', kunci: 'mood', isi: { mood_score: 2 } },
    { nama: 'minum', jalur: '/api/water', kunci: 'water', isi: { amount_ml: 250 } },
    {
      nama: 'ukuran badan',
      jalur: '/api/measurements',
      kunci: 'measurements',
      isi: { waist_cm: 70 },
    },
    {
      nama: 'olahraga',
      jalur: '/api/workouts',
      kunci: 'workout',
      isi: { duration_minutes: 15 },
    },
    { nama: 'makanan', jalur: '/api/food', kunci: 'food', isi: { total_calories: 100 } },
    { nama: 'tidur', jalur: '/api/sleep', kunci: 'sleep', isi: { quality_score: 3 } },
    { nama: 'goal', jalur: '/api/goals', kunci: 'goal', isi: { target_weight_kg: 65 } },
  ];

  for (const { nama, jalur, kunci, isi } of bisaDiubah) {
    it(`PATCH ${nama} milik A dibalas 404 untuk B`, async () => {
      const res = await request(app).patch(`${jalur}/${milikA[kunci]}`).set(sebagai(B)).send(isi);

      // 404, bukan 403. Membalas "tidak boleh" justru memberi tahu bahwa id itu
      // ada dan milik orang lain.
      expect(res.status).toBe(404);
    });
  }

  const bisaDihapus = [
    { nama: 'langkah', jalur: '/api/steps', kunci: 'steps' },
    { nama: 'tidur', jalur: '/api/sleep', kunci: 'sleep' },
    { nama: 'minum', jalur: '/api/water', kunci: 'water' },
    { nama: 'mood', jalur: '/api/mood', kunci: 'mood' },
    { nama: 'ukuran badan', jalur: '/api/measurements', kunci: 'measurements' },
    { nama: 'olahraga', jalur: '/api/workouts', kunci: 'workout' },
    { nama: 'makanan', jalur: '/api/food', kunci: 'food' },
    { nama: 'foto badan', jalur: '/api/body-photos', kunci: 'bodyPhoto' },
    { nama: 'kalori perangkat', jalur: '/api/device-energy', kunci: 'deviceEnergy' },
    { nama: 'custom workout', jalur: '/api/workouts/custom', kunci: 'customWorkout' },
  ];

  for (const { nama, jalur, kunci } of bisaDihapus) {
    it(`DELETE ${nama} milik A dibalas 404 untuk B`, async () => {
      const res = await request(app).delete(`${jalur}/${milikA[kunci]}`).set(sebagai(B));

      expect(res.status).toBe(404);
    });
  }

  it('semua data A masih utuh setelah seluruh percobaan di atas', async () => {
    const repoA = forUser(A.id);

    const [berat, langkah, makanan, olahraga, foto] = await Promise.all([
      repoA.findById('weight_logs', milikA.weight!),
      repoA.findById('step_logs', milikA.steps!),
      repoA.findById('food_logs', milikA.food!),
      repoA.findById('workout_logs', milikA.workout!),
      repoA.findById('body_photos', milikA.bodyPhoto!),
    ]);

    expect(berat.weight_kg).toBe('80.00');
    expect(langkah.steps).toBe(9000);
    expect(makanan.total_calories).toBe(777);
    expect(olahraga.duration_minutes).toBe(30);
    expect(foto.logged_at).toBe(hariIni);
  });
});

describe('riwayat percakapan', () => {
  it('riwayat milik A tidak terlihat oleh B', async () => {
    const res = await request(app).get('/api/chat').set(sebagai(B));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('B mengosongkan riwayat tidak menyentuh milik A', async () => {
    const hapus = await request(app).delete('/api/chat').set(sebagai(B));

    expect(hapus.status).toBe(200);
    // Nol, karena B memang tidak punya apa-apa untuk dihapus.
    expect(hapus.body.data.deleted).toBe(0);

    // Yang paling penting: pesan A harus masih utuh sesudahnya.
    const punyaA = await request(app).get('/api/chat').set(sebagai(A));

    expect(punyaA.body.data).toHaveLength(1);
    expect(punyaA.body.data[0].content).toBe('rahasia percakapan milik A');
  });
});

describe('foto privat', () => {
  /*
    Pembuktian bahwa dua test di bawah tidak lulus dengan sendirinya. Kalau A
    pun dapat 404, yang menolak bukan pemeriksaan kepemilikan melainkan
    berkasnya yang memang tidak ada.
  */
  it('A bisa membuka file miliknya sendiri', async () => {
    const res = await request(app).get(`/api/files/${milikA.fileMakanan}`).set(sebagai(A));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image');
  });

  it('B tidak bisa membuka file yang dirujuk catatan makan A', async () => {
    const res = await request(app).get(`/api/files/${milikA.fileMakanan}`).set(sebagai(B));

    expect(res.status).toBe(404);
  });

  it('B tidak bisa membuka file yang dirujuk foto badan A', async () => {
    const res = await request(app).get(`/api/files/${milikA.fileDepan}`).set(sebagai(B));

    expect(res.status).toBe(404);
  });
});

/**
 * Ringkasan adalah tempat paling berbahaya untuk kebocoran, karena ia
 * mengagregasi belasan collection sekaligus. Satu saja yang lupa disaring dan
 * angkanya ikut menghitung data orang lain, tanpa satu baris pun terlihat.
 */
describe('ringkasan tidak mencampur angka antar user', () => {
  it('harian milik B nol, bukan angka milik A', async () => {
    const res = await request(app)
      .get('/api/summary/daily')
      .set(sebagai(B))
      .query({ date: hariIni });

    const d = res.body.data;

    expect(res.status).toBe(200);
    expect(d.calories_in).toBe(0);
    expect(d.steps).toBe(0);
    expect(d.water_ml).toBe(0);
    expect(d.sleep_minutes).toBe(0);
    expect(d.workout_minutes).toBe(0);
    expect(d.workout_calories).toBe(0);
    expect(d.weight_kg).toBeNull();
    expect(d.mood_score).toBeNull();
    expect(d.device_kcal).toBeNull();
    expect(d.has_body_photo).toBe(false);
    expect(d.calories_out_source).toBe('formula');
  });

  it('mingguan milik B nol, bukan angka milik A', async () => {
    const res = await request(app).get('/api/summary/weekly').set(sebagai(B));

    const d = res.body.data;

    expect(d.total_calories_in).toBe(0);
    expect(d.total_steps).toBe(0);
    expect(d.total_workout_minutes).toBe(0);
    expect(d.avg_device_kcal).toBeNull();
    expect(d.weight_change_kg).toBeNull();
  });

  it('streak dan pengaturan notifikasi B berdiri sendiri', async () => {
    const [streak, notifikasi] = await Promise.all([
      request(app).get('/api/streaks/me').set(sebagai(B)),
      request(app).get('/api/notifications/settings').set(sebagai(B)),
    ]);

    expect(streak.status).toBe(200);
    expect(streak.body.data.current_streak).toBe(0);

    expect(notifikasi.status).toBe(200);
    expect(notifikasi.body.data.user_id).toBe(B.id);
  });

  it('profil B tidak membawa data A', async () => {
    const res = await request(app).get('/api/users/me').set(sebagai(B));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(B.id);
    expect(res.body.data.id).not.toBe(A.id);
  });
});
