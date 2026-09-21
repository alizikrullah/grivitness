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

/**
 * Dua skenario dari percakapan nyata yang pernah dijawab buruk. Pilih lewat
 * argumen kedua: npm run smoke:chat -- bawaan cepat
 */
const SKENARIO: Record<string, string[]> = {
  protein: [
    'Cara memenuhi protein harian sebanyak itu gmn caranya',
    'Gua mau hitungan spesifik dg kombinasi sumber protein, dada ayam sama telor',
    'gua bakal nyampe target tepat waktu ga?',
    'makan malam enaknya apa biar protein cukup',
  ],
  cepat: [
    'Kalau pake strategi defisit dulu sebesar besarnya yang gua bisa terus nanti ketika udah turun gua perbaikin lagi gmn? Diberat gua sekarang susah banget ngapa ngapain',
    'Ya gapapa njir otot ilang bisa gua bentuk lagi, mumpung gua blm kerja makanya mau kejar cepet. Tambah gerak gabisa, geser tanggal juga ga mau',
    'Untuk makan gmn? yang murah aja',
    'Gua gasuka telur dadar',
  ],
};

const main = async (): Promise<void> => {
  const arg = process.argv[2];
  const effort: ChatOptions['reasoningEffort'] =
    arg === 'low' || arg === 'medium' || arg === 'high' ? arg : undefined;
  const skenario = process.argv[3] ?? 'protein';
  const PERTANYAAN = SKENARIO[skenario] ?? SKENARIO.protein ?? [];

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

  // Skenario "cepat" memakai target yang mustahil secara fisika (16 kg dalam
  // 40 hari), persis kasus nyatanya, supaya baris required_deficit teruji.
  const cepat = skenario === 'cepat';
  const target = new Date(Date.now() + (cepat ? 40 : 120) * 86_400_000).toISOString().slice(0, 10);
  await request(app)
    .post('/api/goals')
    .set(auth)
    .send({ target_weight_kg: cepat ? 80 : 85, target_date: target });

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
    write(`reasoning_effort: ${effort ?? 'bawaan model'} | skenario: ${skenario}`);

    const sistem = susunPromptSistem(fakta);
    const riwayat: { role: 'user' | 'assistant'; content: string }[] = [];

    for (const [i, tanya] of PERTANYAAN.entries()) {
      // Jeda seperti orang membaca lalu mengetik. Tanpa ini empat giliran
      // beruntun melewati 8.000 token per menit dan giliran keempat gagal
      // karena batas laju, bukan karena promptnya.
      if (i > 0) await new Promise((r) => setTimeout(r, 15_000));
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
