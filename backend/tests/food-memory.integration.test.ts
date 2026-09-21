import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { cleanupTestUsers, testEmail } from './helpers/directus-cleanup.js';

/**
 * Ingatan makanan lewat API sungguhan. Semua item di sini berlabel atau
 * tertutup ingatan, jadi Groq tidak pernah dipanggil: tes ini tidak boleh
 * gagal karena batas laju.
 */

let app: Express;
let token: string;

const auth = () => ({ Authorization: `Bearer ${token}` });

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

describe('ingatan makanan', () => {
  it('nama yang pernah dicatat dengan kemasan dipakai ulang tanpa label, tanpa berat, tanpa model', async () => {
    const pertama = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'BREAKFAST',
        items: [
          {
            name: 'Nescafe Classic bubuk',
            portions: 1,
            unit: 'g',
            weight: 8,
            label: { kcal: 28, protein_g: 1 },
          },
        ],
      });
    expect(pertama.status).toBe(201);
    expect(pertama.body.data.total_calories).toBe(28);

    // Hari berikutnya: cuma nama. Tanpa foto, tanpa berat, tanpa label.
    const kedua = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'BREAKFAST',
        items: [{ name: 'nescafe classic  bubuk', portions: 2, unit: 'g' }],
      });

    expect(kedua.status).toBe(201);
    const item = kedua.body.data.ai_analysis.items[0];
    expect(item.nutrition_source).toBe('PREVIOUS');
    expect(item.weight_per_portion).toBe(8);
    expect(item.calories).toBe(56);
    expect(item.protein_g).toBe(2);
    expect(kedua.body.data.total_calories).toBe(56);
  });

  it('satuan yang berbeda bukan item yang sama: tanpa berat tetap ditolak', async () => {
    const res = await request(app)
      .post('/api/food')
      .set(auth())
      .send({
        meal_type: 'SNACK',
        items: [{ name: 'Nescafe Classic bubuk', portions: 1, unit: 'ml' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Nescafe Classic bubuk');
  });

  it('saran nama datang dari catatan sendiri, lengkap dengan berat dan kemasannya', async () => {
    const res = await request(app).get('/api/food/suggestions').set(auth()).query({ q: 'nes' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const s = res.body.data[0];
    expect(s.name).toBe('Nescafe Classic bubuk');
    expect(s.unit).toBe('g');
    expect(s.weight_per_portion).toBe(8);
    expect(s.label).toEqual({ kcal: 28, protein_g: 1, carbs_g: 0, fat_g: 0 });
    expect(s.origin).toBe('LABEL');
    expect(s.times).toBe(2);
  });

  it('tanpa kata pencarian, saran berisi yang paling sering', async () => {
    const res = await request(app).get('/api/food/suggestions').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('Nescafe Classic bubuk');
  });

  it('koreksi porsi mempertahankan asal PREVIOUS', async () => {
    const hari = await request(app).get('/api/food/today').set(auth());
    const log = hari.body.data.logs.find(
      (l: { ai_analysis: { items: { nutrition_source: string }[] } }) =>
        l.ai_analysis.items[0]?.nutrition_source === 'PREVIOUS',
    );
    expect(log).toBeDefined();

    const ubah = await request(app)
      .patch(`/api/food/${log.id as string}`)
      .set(auth())
      .send({ items: [{ name: 'nescafe classic bubuk', portions: 3, unit: 'g' }] });

    expect(ubah.status).toBe(200);
    expect(ubah.body.data.ai_analysis.items[0].nutrition_source).toBe('PREVIOUS');
    expect(ubah.body.data.total_calories).toBe(84);
  });
});
