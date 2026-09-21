/**
 * Uji manual fitur chat terhadap Groq SUNGGUHAN, di luar npm test.
 *
 * Membuat satu user uji dengan profil, berat, target, dan dua sesi makan,
 * lalu mengirim beberapa pertanyaan yang dulu dijawab buruk. Untuk tiap
 * pertanyaan dicetak: balasan model, waktu, dan pemakaian token termasuk
 * token penalaran, supaya keputusan soal reasoning_effort dan batas token
 * diambil dari angka, bukan tebakan.
 *
 * Jalankan: npm run smoke:chat
 * Pilih tingkat penalaran: npm run smoke:chat -- low   (atau medium, high, bawaan)
 *
 * Memakai kuota Groq dan bisa kena batas laju kalau dijalankan berdekatan
 * dengan smoke:ai. Itu bukan bug kode.
 */
import request from 'supertest';

import { createApp } from '../src/app.js';
import {
  kumpulkanFakta,
  rapikanBalasan,
  susunPromptSistem,
} from '../src/modules/chat/chat.service.js';
import { type ChatOptions, chatCompletion } from '../src/utils/groq.js';
import { cleanupTestUsers, testEmail } from '../tests/helpers/directus-cleanup.js';

const write = (line: string) => process.stdout.write(`${line}\n`);

const PERTANYAAN = [
  'Cara memenuhi protein harian sebanyak itu gmn caranya',
  'Gua mau hitungan spesifik dg kombinasi sumber protein, dada ayam sama telor',
  'gua bakal nyampe target tepat waktu ga?',
  'makan malam enaknya apa biar protein cukup',
];

const main = async (): Promise<void> => {
  const arg = process.argv[2];
  const effort: ChatOptions['reasoningEffort'] =
    arg === 'low' || arg === 'medium' || arg === 'high' ? arg : undefined;

  const app = createApp();
  await cleanupTestUsers();

  const daftar = await request(app)
    .post('/api/auth/register')
    .send({ email: testEmail('smokechat'), password: 'RahasiaBanget123', name: 'Uji Chat' });
  const token = daftar.body.data.access_token as string;
  const userId = daftar.body.data.user.id as string;
  const auth = { Authorization: `Bearer ${token}` };

  await request(app).post('/api/users/me/profile').set(auth).send({
    height_cm: 172,
    birth_date: '1998-03-10',
    gender: 'MALE',
    activity_level: 'SEDENTARY',
  });
  await request(app).post('/api/weight').set(auth).send({ weight_kg: 96 });

  const target = new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10);
  await request(app)
    .post('/api/goals')
    .set(auth)
    .send({ target_weight_kg: 85, target_date: target });

  await request(app)
    .post('/api/food')
    .set(auth)
    .send({
      meal_type: 'BREAKFAST',
      items: [
        { name: 'Roti gandum', portions: 2, unit: 'g', label: { kcal: 80, protein_g: 4 } },
        { name: 'Telur rebus', portions: 2, unit: 'g', label: { kcal: 70, protein_g: 6 } },
      ],
    });

  try {
    const fakta = await kumpulkanFakta(userId);
    write('LEMBAR FAKTA:');
    write(fakta.replace(/^/gm, '  '));
    write('');
    write(`reasoning_effort: ${effort ?? 'bawaan model'}`);

    const sistem = susunPromptSistem(fakta);
    const riwayat: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const tanya of PERTANYAAN) {
      write('');
      write(`> ${tanya}`);

      let pemakaian = '';
      const mulai = Date.now();
      const jawab = rapikanBalasan(
        await chatCompletion(
          [{ role: 'system', content: sistem }, ...riwayat, { role: 'user', content: tanya }],
          {
            reasoningEffort: effort,
            onUsage: (u, selesai) => {
              pemakaian = `prompt ${u.prompt_tokens ?? '?'}, jawaban ${u.completion_tokens ?? '?'}, penalaran ${u.completion_tokens_details?.reasoning_tokens ?? '?'}, finish ${selesai ?? '?'}`;
            },
          },
        ),
      );
      const ms = Date.now() - mulai;

      write(jawab.replace(/^/gm, '  '));
      write(`  [${ms} ms | ${pemakaian} | ${jawab.split(/\s+/).length} kata]`);

      riwayat.push({ role: 'user', content: tanya }, { role: 'assistant', content: jawab });
    }
  } finally {
    await cleanupTestUsers();
  }
};

main().catch((error: unknown) => {
  write(`GAGAL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
