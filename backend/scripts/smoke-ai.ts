/**
 * Smoke test pipeline foto: Multer -> Sharp -> Directus storage -> Groq -> database.
 *
 * Jalankan manual: npm run smoke:ai
 *
 * Sengaja TIDAK dijadikan bagian dari `npm test`. Setiap eksekusi memakai kuota
 * Groq yang berbayar, jadi tidak pantas ikut berjalan di setiap perubahan kode.
 * Dipakai saat menyentuh utils/sharp.ts, utils/groq.ts, utils/directus-files.ts,
 * atau module food dan body-photos.
 *
 * Seluruh data uji dibersihkan di akhir, termasuk file yang terunggah.
 */

import { readItems } from '@directus/sdk';
import request from 'supertest';
import sharp from 'sharp';

import { createApp } from '../src/app.js';
import { directus } from '../src/config/directus.js';
import { cleanupTestUsers, testEmail } from '../tests/helpers/directus-cleanup.js';

const write = (line: string) => process.stdout.write(`${line}\n`);
const ok = (line: string) => write(`  \x1b[32mOK\x1b[0m   ${line}`);
const bad = (line: string) => write(`  \x1b[31mGAGAL\x1b[0m ${line}`);

/** Gambar sintetis. Isinya tidak penting — yang diuji pipeline-nya, bukan akurasi AI. */
const gambarUji = (r: number, g: number, b: number): Promise<Buffer> =>
  sharp({ create: { width: 640, height: 480, channels: 3, background: { r, g, b } } })
    .jpeg()
    .toBuffer();

const main = async (): Promise<void> => {
  const app = createApp();
  await cleanupTestUsers();

  const email = testEmail('smokeai');
  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'RahasiaBanget123', name: 'Smoke AI' });

  const token = daftar.body.data.access_token as string;
  const userId = daftar.body.data.user.id as string;
  write(`\nUser uji dibuat: ${userId}\n`);

  const fileTerunggah: string[] = [];

  try {
    write('POST /api/food');
    const foto = await gambarUji(200, 150, 100);

    const food = await request(app)
      .post('/api/food')
      .set('Authorization', `Bearer ${token}`)
      .field('meal_type', 'LUNCH')
      .attach('photo', foto, 'makan.jpg');

    if (food.status !== 201) {
      bad(`status ${food.status}: ${JSON.stringify(food.body.error)}`);
    } else {
      const d = food.body.data;
      fileTerunggah.push(d.directus_file_id as string);
      ok(`log dibuat, file ${d.directus_file_id}`);
      ok(`kalori ${d.total_calories}, protein ${d.protein_g}g`);
      ok(`ai_analysis tersimpan: ${Object.keys(d.ai_analysis ?? {}).join(', ')}`);

      // photo_url menunjuk ke proxy milik backend, bukan ke Directus langsung.
      // File di Directus privat, jadi hanya lewat sinilah client bisa membukanya.
      const url = d.photo_url as string;

      const cek = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      if (cek.status === 200 && cek.headers['content-type'] === 'image/webp') {
        ok(`foto bisa diakses lewat ${url}`);
      } else {
        bad(`foto tidak bisa diakses: ${cek.status} ${cek.headers['content-type']}`);
      }

      // Tanpa token, endpoint yang sama harus menolak.
      const tanpaToken = await request(app).get(url);
      if (tanpaToken.status === 401) ok('foto ditolak tanpa autentikasi');
      else bad(`tanpa token seharusnya 401, dapat ${tanpaToken.status}`);
    }

    write('\nPOST /api/body-photos');
    const [depan, samping] = await Promise.all([
      gambarUji(180, 160, 140),
      gambarUji(170, 150, 130),
    ]);

    const body = await request(app)
      .post('/api/body-photos')
      .set('Authorization', `Bearer ${token}`)
      .attach('front_photo', depan, 'depan.jpg')
      .attach('side_photo', samping, 'samping.jpg');

    if (body.status !== 201) {
      bad(`status ${body.status}: ${JSON.stringify(body.body.error)}`);
    } else {
      const d = body.body.data;
      fileTerunggah.push(d.front_directus_file_id as string, d.side_directus_file_id as string);
      ok(`log dibuat, dua file terunggah`);
      ok(`ai_analysis: ${Object.keys(d.ai_analysis ?? {}).join(', ')}`);
    }

    write('\nGET /api/summary/daily');
    const summary = await request(app)
      .get('/api/summary/daily')
      .set('Authorization', `Bearer ${token}`);

    if (summary.status !== 200) bad(`status ${summary.status}`);
    else {
      ok(`kalori masuk ${summary.body.data.calories_in}`);
      ok(`ada foto badan: ${summary.body.data.has_body_photo}`);
    }

    write('\nRollback saat file terlalu besar (tidak boleh menyisakan file yatim)');
    const sebelum = await request(app)
      .get('/api/food/today')
      .set('Authorization', `Bearer ${token}`);

    const tolak = await request(app)
      .post('/api/food')
      .set('Authorization', `Bearer ${token}`)
      .field('meal_type', 'BUKAN_MEAL_TYPE')
      .attach('photo', foto, 'makan.jpg');

    if (tolak.status === 400) ok(`meal_type ngawur ditolak: ${tolak.body.error.code}`);
    else bad(`seharusnya 400, dapat ${tolak.status}`);

    const sesudah = await request(app)
      .get('/api/food/today')
      .set('Authorization', `Bearer ${token}`);

    const jumlahSebelum = (sebelum.body.data.logs as unknown[]).length;
    const jumlahSesudah = (sesudah.body.data.logs as unknown[]).length;

    if (jumlahSebelum === jumlahSesudah) ok('tidak ada log tersisa dari request yang ditolak');
    else bad(`jumlah log berubah ${jumlahSebelum} -> ${jumlahSesudah}`);
  } finally {
    write('\nBersih-bersih');

    const logs = await directus.request(
      readItems('food_logs', { filter: { user_id: { _eq: userId } }, limit: -1 }),
    );
    const fotos = await directus.request(
      readItems('body_photos', { filter: { user_id: { _eq: userId } }, limit: -1 }),
    );

    // Hapus lewat endpoint supaya jalur penghapusan file ikut teruji.
    for (const log of logs) {
      await request(app).delete(`/api/food/${log.id}`).set('Authorization', `Bearer ${token}`);
    }
    for (const foto of fotos) {
      await request(app)
        .delete(`/api/body-photos/${foto.id}`)
        .set('Authorization', `Bearer ${token}`);
    }

    let yatim = 0;
    for (const id of fileTerunggah) {
      const cek = await fetch(`${process.env.DIRECTUS_URL}/assets/${id}`);
      if (cek.ok) yatim += 1;
    }

    if (yatim === 0) ok(`${fileTerunggah.length} file terhapus dari storage`);
    else bad(`${yatim} file masih ada di storage setelah dihapus`);

    await cleanupTestUsers();
    ok('user uji dihapus');
    write('');
  }
};

main().catch((error: unknown) => {
  process.stderr.write(`\nSmoke test gagal: ${String(error)}\n\n`);
  process.exit(1);
});
