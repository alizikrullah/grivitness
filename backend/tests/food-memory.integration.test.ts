import { updateItem } from '@directus/sdk';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { directus } from '../src/config/directus.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Ingatan makanan lewat API sungguhan. Semua item di sini berlabel lengkap
 * dengan gula, atau tertutup catatan yang dipilih, jadi Groq tidak pernah
 * dipanggil: tes ini tidak boleh gagal karena batas laju.
 */

let app: Express;
let token: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

const nescafeLabel = { kcal: 28, protein_g: 1, sugar_g: 0 };

beforeAll(async () => {
  app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('foodmem'), password: 'RahasiaBanget123', name: 'Uji Ingatan' });
  token = daftar.body.data.access_token as string;
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe('ingatan makanan hanya lewat klik saran', () => {
  it('catatan pertama dari kemasan, lengkap dengan gula, tanpa model', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'BREAKFAST',
        items: [
          { name: 'Nescafe Classic bubuk', portions: 1, unit: 'g', weight: 8, label: nescafeLabel },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total_calories).toBe(28);
    expect(res.body.data.ai_analysis.items[0].sugar_source).toBe('LABEL');
  });

  /**
   * Celah 1: nama yang diketik sama persis dulu diam-diam memakai ingatan.
   * Sekarang ketik berarti "taksir dari awal", jadi tanpa berat dan tanpa
   * foto ditolak, persis seperti makanan baru.
   */
  it('nama yang DIKETIK sama persis tidak memakai catatan: tanpa berat ditolak', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'BREAKFAST',
        items: [{ name: 'Nescafe Classic bubuk', portions: 1, unit: 'g' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Nescafe Classic bubuk');
  });

  it('item yang DIKLIK dari saran memakai catatan: tanpa label, tanpa berat, tanpa model', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'BREAKFAST',
        items: [{ name: 'nescafe classic  bubuk', portions: 2, unit: 'g', from_memory: true }],
      });

    expect(res.status).toBe(201);
    const item = res.body.data.ai_analysis.items[0];
    expect(item.nutrition_source).toBe('PREVIOUS');
    expect(item.weight_per_portion).toBe(8);
    // Celah 5: berat dari catatan dulu tertulis AI.
    expect(item.weight_source).toBe('PREVIOUS');
    expect(item.calories).toBe(56);
    expect(item.protein_g).toBe(2);
    expect(item.sugar_source).toBe('PREVIOUS');
    expect(res.body.data.total_calories).toBe(56);
    // Model tidak dipanggil dan tidak ada foto: tidak ada yang diperiksa.
    expect(res.body.data.ai_analysis.photo_matches).toBeNull();
  });

  it('tanda klik dengan satuan yang tidak ada di catatan diperlakukan makanan baru', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'SNACK',
        items: [{ name: 'Nescafe Classic bubuk', portions: 1, unit: 'ml', from_memory: true }],
      });

    expect(res.status).toBe(400);
  });

  it('saran membawa berat, kemasan, dan kalori satu porsinya', async () => {
    const res = await request(app).get('/api/food/suggestions').set(auth()).query({ q: 'nes' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const s = res.body.data[0];
    expect(s.name).toBe('Nescafe Classic bubuk');
    expect(s.unit).toBe('g');
    expect(s.weight_per_portion).toBe(8);
    expect(s.label).toEqual({ kcal: 28, protein_g: 1, carbs_g: 0, fat_g: 0, sugar_g: 0 });
    expect(s.kcal_per_portion).toBe(28);
    expect(s.origin).toBe('LABEL');
    expect(s.times).toBe(2);
  });

  it('menolak gula yang lebih besar dari karbohidrat', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'SNACK',
        items: [
          {
            name: 'Biskuit',
            portions: 1,
            unit: 'g',
            label: { kcal: 95, carbs_g: 17, sugar_g: 30 },
          },
        ],
      });

    expect(res.status).toBe(400);
  });
});

describe('koreksi', () => {
  const ambilLog = async (nama: string) => {
    const hari = await request(app).get('/api/food/today').set(auth());
    return (
      hari.body.data.logs as {
        id: string;
        ai_analysis: { items: { name: string; nutrition_source: string }[] };
      }[]
    ).find((l) => l.ai_analysis.items[0]?.nutrition_source === nama);
  };

  it('ubah porsi mempertahankan asal PREVIOUS', async () => {
    const log = await ambilLog('PREVIOUS');
    expect(log).toBeDefined();

    const ubah = await request(app)
      .patch(`/api/food/${log!.id}`)
      .set(auth())
      .send({
        items: [{ name: 'nescafe classic bubuk', portions: 3, unit: 'g', source_index: 0 }],
      });

    expect(ubah.status).toBe(200);
    expect(ubah.body.data.ai_analysis.items[0].nutrition_source).toBe('PREVIOUS');
    expect(ubah.body.data.total_calories).toBe(84);
  });

  /**
   * Celah 7: ganti nama di koreksi dulu tetap memakai gizi lama. Sekarang item
   * itu dianggap makanan lain. Di sini nama baru diberi kemasan supaya tidak
   * perlu model; tanpa kemasan, item itu ditaksir ulang model teks.
   */
  it('ganti nama berarti makanan lain: gizi lama tidak dipakai', async () => {
    const log = await ambilLog('LABEL');
    expect(log).toBeDefined();

    const ubah = await request(app)
      .patch(`/api/food/${log!.id}`)
      .set(auth())
      .send({
        items: [
          {
            name: 'Kopi kapal api',
            portions: 1,
            unit: 'g',
            source_index: 0,
            label: { kcal: 20, sugar_g: 1 },
          },
        ],
      });

    expect(ubah.status).toBe(200);
    const item = ubah.body.data.ai_analysis.items[0];
    expect(item.name).toBe('Kopi kapal api');
    expect(item.calories).toBe(20);
    expect(item.sugar_g).toBe(1);
    expect(ubah.body.data.total_calories).toBe(20);
    expect(ubah.body.data.sugar_g).toBe('1.00');
  });

  it('Abaikan menghapus tanda foto tidak cocok, balasan model tetap tersimpan', async () => {
    const log = await ambilLog('LABEL');
    expect(log).toBeDefined();

    // Membuat sesi berfoto tanpa memanggil model tidak mungkin, jadi tanda
    // "tidak cocok" dipasang langsung lewat admin seperti hasil model.
    await directus.request(
      updateItem('food_logs', log!.id, {
        ai_analysis: {
          ...(log!.ai_analysis as Record<string, unknown>),
          source: 'PHOTO',
          photo_matches: false,
          photo_note: 'Foto terlihat seperti mie.',
        },
      }),
    );

    const ubah = await request(app)
      .patch(`/api/food/${log!.id}`)
      .set(auth())
      .send({ dismiss_photo_note: true });

    expect(ubah.status).toBe(200);
    expect(ubah.body.data.ai_analysis.photo_matches).toBe(true);
    expect(ubah.body.data.ai_analysis.photo_note).toBeNull();
    expect(ubah.body.data.ai_analysis.photo_dismissed).toBe(true);
  });
});

describe('Lupakan', () => {
  it('nama yang dilupakan hilang dari saran', async () => {
    const lupa = await request(app)
      .post('/api/food/suggestions/forget')
      .set(auth())
      .send({ name: 'Nescafe Classic bubuk', unit: 'g' });
    expect(lupa.status).toBe(200);

    const saran = await request(app).get('/api/food/suggestions').set(auth()).query({ q: 'nes' });
    expect(saran.body.data).toHaveLength(0);
  });

  it('klik pada nama yang sudah dilupakan tidak menemukan catatan', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'SNACK',
        items: [{ name: 'Nescafe Classic bubuk', portions: 1, unit: 'g', from_memory: true }],
      });

    // Tanpa catatan dan tanpa berat: diperlakukan makanan baru, ditolak.
    expect(res.status).toBe(400);
  });

  it('catatan sesudahnya membangun ingatan dari nol', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'SNACK',
        items: [
          {
            name: 'Nescafe Classic bubuk',
            portions: 1,
            unit: 'g',
            weight: 10,
            label: { kcal: 35, sugar_g: 0 },
          },
        ],
      });
    expect(res.status).toBe(201);

    const saran = await request(app).get('/api/food/suggestions').set(auth()).query({ q: 'nes' });
    expect(saran.body.data).toHaveLength(1);
    expect(saran.body.data[0].kcal_per_portion).toBe(35);
    expect(saran.body.data[0].times).toBe(1);
  });
});
