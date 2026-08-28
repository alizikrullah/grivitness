import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { ChatMessageRecord } from '../../types/directus-schema.js';
import { chatCompletion, type ChatMessage } from '../../utils/groq.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import * as summaryService from '../summary/summary.service.js';
import * as usersService from '../users/users.service.js';

/**
 * Aturan yang diberikan ke model.
 *
 * Aturan nomor satu yang paling menentukan: model TIDAK BOLEH menghitung.
 * Seluruh kerja di calories.ts, targets.ts, dan observed-tdee.ts bersandar pada
 * rumus yang ada rujukannya, dan model bahasa buruk dalam aritmetika sekaligus
 * percaya diri saat salah. Satu kalimat karangan soal defisit bisa membatalkan
 * semua itu tanpa user pernah tahu. Jadi angka masuk sebagai fakta jadi, dan
 * tugas model cuma memilih mana yang penting lalu menyusunnya jadi kalimat.
 */
const ATURAN = `Kamu asisten kebugaran di dalam aplikasi GriviTness, menemani satu orang yang sedang berusaha menurunkan berat badan.

ATURAN YANG TIDAK BOLEH DILANGGAR:

1. JANGAN MENGHITUNG APA PUN. Semua angka yang boleh kamu sebut sudah tersedia di bagian DATA. Kalau sebuah angka tidak ada di sana, bilang terus terang kamu belum punya datanya. Jangan menaksir, menjumlahkan, mengurangi, atau mengarang angka baru.
2. Jawab hanya seputar kebugaran, gizi, olahraga, tidur, dan kesehatan yang berkaitan. Untuk topik lain, tolak dengan singkat lalu tawarkan kembali ke topik itu.
3. Kamu bukan dokter. Begitu muncul gejala, nyeri, obat, atau dugaan penyakit, sarankan menemui tenaga kesehatan dan jangan mendiagnosa.
4. Jangan menyarankan makan di bawah jatah kalori yang tertulis di DATA. Jatah itu sudah ditahan di batas aman menurut pedoman NIH/NHLBI.
5. Kalau DATA menunjukkan sesuatu yang berlawanan dengan tebakan umum, ikuti DATA.
6. Bahasa Indonesia santai, seperti teman yang paham olahraga. Panggil dia "kamu".
7. Ringkas. Maksimal sekitar 120 kata, kecuali dia memang minta rinci.
8. Jangan pakai tanda pisah em dash. Pakai koma, titik, atau tanda kurung.
9. Tulis teks biasa. Jangan pakai markdown: tidak ada bintang untuk menebalkan, tidak ada tanda pagar untuk judul. Kalau perlu daftar, pakai tanda hubung di awal baris.`;

const angka = (n: number): string => n.toLocaleString('id-ID');

const menit = (m: number): string => `${Math.floor(m / 60)} jam ${m % 60} menit`;

/**
 * Fakta yang dikirim ke model, sudah dihitung backend.
 *
 * Sengaja padat. Setiap barisnya ikut terkirim pada SETIAP giliran percakapan,
 * jadi baris yang tidak berguna dibayar berulang kali. Nilai yang kosong
 * dihilangkan, bukan ditulis sebagai "null" yang cuma menghabiskan token dan
 * mengundang model menebak.
 */
const susunFakta = (
  harian: summaryService.DailySummary,
  pekan: summaryService.PeriodSummary,
  profil: usersService.ProfileWithDerived | null,
): string => {
  const b: string[] = [];

  b.push(`Tanggal hari ini: ${harian.date} (WIB).`);

  if (profil) {
    b.push(
      `Profil: umur ${profil.age} tahun, ${profil.gender === 'MALE' ? 'pria' : profil.gender === 'FEMALE' ? 'wanita' : 'lainnya'}, tinggi ${profil.height_cm} cm.`,
    );
    b.push(`Kesehariannya: ${profil.activity_label}`);
    if (profil.current_weight_kg !== null)
      b.push(`Berat terakhir: ${profil.current_weight_kg} kg.`);
    if (profil.bmr !== null) b.push(`BMR: ${angka(profil.bmr)} kkal.`);
    if (profil.tdee !== null) b.push(`TDEE hari biasa: ${angka(profil.tdee)} kkal.`);

    const o = profil.observed_tdee;
    if (o?.measured != null) {
      b.push(
        `TDEE terukur dari catatannya sendiri: ${angka(o.measured)} kkal (bobot keyakinan ${Math.round(o.confidence * 100)}%). Ini lebih dipercaya daripada angka rumus.`,
      );
    } else if (o?.reason) {
      b.push(`TDEE belum bisa diukur dari datanya. Alasan: ${o.reason}.`);
    }
  } else {
    b.push('Profil belum diisi, jadi metabolismenya belum bisa dihitung.');
  }

  b.push('');
  b.push('HARI INI:');
  b.push(
    `Kalori masuk ${angka(harian.calories_in)} kkal, keluar ${angka(harian.calories_out)} kkal.`,
  );
  if (harian.calories_out_source === 'device') {
    b.push(
      `Angka kalori keluar itu berasal dari smartwatch-nya (${angka(harian.device_kcal ?? 0)} kkal), bukan dari rumus, ditambah olahraga yang jamnya tidak merekam.`,
    );
  }
  if (harian.calorie_budget !== null) {
    b.push(
      `Jatah kalori ${angka(harian.calorie_budget)} kkal, sisa ${angka(harian.calories_remaining ?? 0)} kkal.`,
    );
  } else {
    b.push('Belum ada target berat badan aktif, jadi jatah kalorinya belum ada.');
  }
  b.push(
    `Protein ${harian.protein_g} g, karbohidrat ${harian.carbs_g} g, lemak ${harian.fat_g} g.`,
  );
  b.push(`Langkah ${angka(harian.steps)}. Minum ${angka(harian.water_ml)} ml.`);
  b.push(`Tidur ${menit(harian.sleep_minutes)}.`);
  if (harian.workout_minutes > 0) {
    b.push(
      `Olahraga ${harian.workout_minutes} menit, membakar ${angka(harian.workout_calories)} kkal bersih.`,
    );
  } else {
    b.push('Belum ada olahraga tercatat hari ini.');
  }
  if (harian.mood_score !== null) b.push(`Mood ${harian.mood_score} dari 5.`);

  const t = harian.targets;
  b.push('');
  b.push('TARGET HARIAN (sudah diturunkan dari tubuh dan tujuannya, jangan diubah):');
  b.push(
    `Air ${angka(t.water_ml)} ml. Tidur ${menit(t.sleep.min_minutes)} sampai ${menit(t.sleep.max_minutes)}. Langkah ${angka(t.steps.steps)}.`,
  );
  if (t.macros) {
    b.push(
      `Protein ${t.macros.protein_g} g, karbohidrat ${t.macros.carbs_g} g, lemak ${t.macros.fat_g} g.`,
    );
  }

  b.push('');
  b.push(`TUJUH HARI TERAKHIR (${pekan.from} sampai ${pekan.to}):`);
  if (pekan.weight_change_kg !== null) {
    const arah =
      pekan.weight_change_kg < 0 ? 'turun' : pekan.weight_change_kg > 0 ? 'naik' : 'tetap';
    b.push(
      `Berat ${arah} ${Math.abs(pekan.weight_change_kg)} kg (dari ${pekan.weight_start} ke ${pekan.weight_end} kg).`,
    );
  } else {
    b.push('Penimbangannya belum cukup untuk melihat perubahan berat.');
  }
  b.push(`Rata-rata kalori masuk ${angka(pekan.avg_calories_in)} kkal per hari.`);
  b.push(`Rata-rata langkah ${angka(pekan.avg_steps)} per hari.`);
  b.push(`Rata-rata tidur ${menit(Math.round(pekan.avg_sleep_minutes))} per malam.`);
  b.push(`Olahraga total ${pekan.total_workout_minutes} menit.`);
  b.push(`Dia mencatat sesuatu pada ${pekan.days_logged} dari ${pekan.days} hari.`);

  return b.join('\n');
};

/**
 * Profil bisa saja belum ada, dan itu bukan kondisi error di sini.
 *
 * User baru yang belum onboarding tetap boleh bertanya. Yang berubah cuma
 * kedalaman jawabannya, dan model diberi tahu apa yang tidak diketahuinya.
 */
const ambilProfil = async (userId: string): Promise<usersService.ProfileWithDerived | null> => {
  try {
    return await usersService.getProfile(userId);
  } catch {
    return null;
  }
};

/**
 * Membersihkan tanda pisah dari balasan model.
 *
 * Aturan di prompt sudah melarangnya, dan model tetap memakainya. Itu memang
 * sifat prompt: bujukan, bukan jaminan. Satu-satunya cara memastikannya adalah
 * memeriksa hasilnya di sini.
 *
 * Em dash jadi koma karena perannya memisahkan keterangan, kecuali di awal
 * baris tempat ia sebenarnya berfungsi sebagai penanda daftar. En dash dan
 * tanda hubung non-breaking jadi tanda hubung biasa: keduanya hampir selalu
 * muncul pada rentang angka dan kata majemuk, dan bentuk khususnya tidak
 * memberi apa pun selain kesan mesin.
 *
 * Bintang markdown ikut dilucuti. Komponen teks di mobile menampilkan apa
 * adanya, jadi penebalan yang tidak dirender cuma muncul sebagai bintang yang
 * mengotori kalimat.
 */
const tanpaTandaPisah = (teks: string): string =>
  teks
    // Tanda pisahnya ditulis sebagai escape unicode, BUKAN karakternya langsung.
    //
    // Karakter aslinya di sini pernah ikut tersapu ketika em dash dibersihkan
    // dari seluruh repo, dan fungsi ini diam-diam berubah jadi mengganti KOMA.
    // Bentuk escape membuatnya kebal terhadap penyisiran teks, dan kerusakan
    // semacam itu tidak akan tertangkap typecheck maupun lint.
    //
    // u2014 em dash, u2013 en dash, u2011 hyphen non-breaking, u2212 minus.
    .replace(/^[ ]*\u2014[ ]*/gm, '- ')
    .replace(/[ ]*\u2014[ ]*/g, ', ')
    .replace(/[\u2013\u2011\u2212]/g, '-')
    .replace(/[*][*]/g, '')
    .replace(/^#{1,6} +/gm, '');

/**
 * Berapa pesan terakhir yang ikut dikirim ke model.
 *
 * Riwayatnya disimpan seluruhnya, tapi yang dikirim dibatasi. Setiap pesan lama
 * ikut terkirim pada SETIAP giliran, jadi percakapan tanpa batas membuat
 * biayanya tumbuh kuadratik dan cepat menabrak batas token per menit Groq.
 */
const KONTEKS_MAKS = 20;

/** Seluruh riwayat percakapan user, urut dari yang paling lama. */
export const getHistory = async (userId: string): Promise<ChatMessageRecord[]> =>
  forUser(userId).list('chat_messages', { sort: ['created_at'], limit: -1 });

export const clearHistory = async (userId: string): Promise<{ deleted: number }> => {
  const repo = forUser(userId);

  const pesan = await repo.list('chat_messages', { fields: ['id'], limit: -1 });

  // Dihapus bersamaan, bukan satu per satu. Setiap penghapusan adalah round-trip
  // HTTP ke Directus, dan percakapan panjang berarti puluhan kali latensi
  // ditumpuk hanya untuk satu ketukan tombol.
  await Promise.all(pesan.map((p) => repo.remove('chat_messages', p.id)));

  return { deleted: pesan.length };
};

export const reply = async (userId: string, pesanBaru: string): Promise<{ reply: string }> => {
  const hariIni = todayInJakarta();

  const [harian, pekan, profil, riwayat] = await Promise.all([
    summaryService.getDaily(userId, hariIni),
    // Tanpa argumen, getWeekly memakai tujuh hari terakhir sampai hari ini.
    summaryService.getWeekly(userId),
    ambilProfil(userId),
    getHistory(userId),
  ]);

  const sebelumnya: ChatMessage[] = riwayat.slice(-KONTEKS_MAKS).map((p) => ({
    role: p.role === 'ASSISTANT' ? 'assistant' : 'user',
    content: p.content,
  }));

  const percakapan: ChatMessage[] = [
    { role: 'system', content: `${ATURAN}\n\nDATA:\n${susunFakta(harian, pekan, profil)}` },
    ...sebelumnya,
    { role: 'user', content: pesanBaru },
  ];

  /*
    Model dipanggil LEBIH DULU, baru keduanya disimpan.

    Kalau pesan user disimpan duluan lalu Groq gagal, riwayatnya menyisakan
    pertanyaan tanpa jawaban, dan giliran berikutnya membawa konteks yang
    timpang. Menunda penyimpanan sampai balasannya ada membuat keadaan setengah
    jadi itu tidak mungkin terjadi.
  */
  const balasan = tanpaTandaPisah(await chatCompletion(percakapan));

  // Dua penulisan, jadi dibungkus unitOfWork: kalau menyimpan balasan gagal,
  // pesan user yang sudah tersimpan ikut dibatalkan.
  await unitOfWork(async (tx) => {
    const repo = forUser(userId, tx);

    await repo.create('chat_messages', { role: 'USER', content: pesanBaru });
    await repo.create('chat_messages', { role: 'ASSISTANT', content: balasan });
  });

  return { reply: balasan };
};
