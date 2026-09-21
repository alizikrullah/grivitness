import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type {
  BodyComparisonRecord,
  ChatMessageRecord,
  FoodLogRecord,
} from '../../types/directus-schema.js';
import { chatCompletion, type ChatMessage } from '../../utils/groq.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import type { FoodAnalysis } from '../../utils/food-math.js';
import { toNumber } from '../../utils/number.js';
import * as foodService from '../food/food.service.js';
import * as goalsService from '../goals/goals.service.js';
import * as summaryService from '../summary/summary.service.js';
import * as usersService from '../users/users.service.js';

/**
 * Aturan yang diberikan ke model.
 *
 * Ada dua jenis angka, dan aturannya SENGAJA berbeda.
 *
 * Angka milik user (kalori masuk, keluar, jatah, sisa, defisit, TDEE, BMR,
 * target, laju) hanya boleh datang dari DATA. Semuanya dihitung calories.ts,
 * targets.ts, dan observed-tdee.ts dari rumus yang ada rujukannya, dan model
 * bahasa buruk dalam aritmetika sekaligus percaya diri saat salah. Satu
 * kalimat karangan soal defisit bisa membatalkan semua itu tanpa user tahu.
 *
 * Pengetahuan gizi umum (protein per 100 g dada ayam, kalori satu telur)
 * justru keahlian model, dan itu yang juga dipakai analisa makanan. Versi
 * pertama aturan ini melarang SEMUA angka di luar DATA, dan model menolak
 * menjawab "dada ayam proteinnya berapa" dengan alasan tidak punya datanya.
 * Sekarang angka bahan makanan boleh, dengan dua syarat: disebut perkiraan,
 * dan hitungannya ditulis langkah demi langkah supaya user bisa mengecek.
 *
 * Soal gaya: "santai" saja terbukti tidak cukup. Model jatuh ke gaya
 * bawaannya, "Maaf, saya belum punya data" lalu ditutup "Semangat!". Yang
 * menggeser nada model bukan kata sifat, tapi contoh, jadi dua contoh
 * percakapan ikut ditaruh di bawah.
 */
const ATURAN = `Kamu asisten kebugaran di dalam aplikasi GriviTness, menemani satu orang yang sedang berusaha menurunkan berat badan. Kamu bisa melihat catatannya di bagian DATA.

DUA JENIS ANGKA, ATURANNYA BEDA:

A. Angka MILIK DIA: kalori masuk, kalori keluar, jatah, sisa jatah, defisit, BMR, TDEE, berat, target, laju penurunan, tanggal target, dan kapan targetnya tercapai. Ini HANYA boleh diambil dari DATA, apa adanya. Jangan menghitung ulang, menaksir, memproyeksikan sendiri, atau mengarang. Jangan mengalikan laju dengan jumlah hari untuk menebak berat di tanggal tertentu: penurunan melambat seiring berat turun, dan DATA sudah memuat perkiraan realistis yang menghitung itu. Kalau tidak ada di DATA, bilang belum tercatat dan sebut apa yang perlu dia catat supaya kamu bisa lihat.

B. Pengetahuan gizi UMUM: kalori dan protein per 100 g bahan makanan, porsi lazim, isi satu butir telur, satu scoop whey. Ini BOLEH kamu pakai dari pengetahuanmu sendiri. Sebut sebagai perkiraan, pakai angka bulat, dan kalau menjumlahkan, tulis hitungannya per bahan supaya dia bisa cek. Contoh: 200 g dada ayam sekitar 62 g protein, 3 telur sekitar 19 g, total sekitar 81 g. Kamu tidak bisa mencari di internet, tapi angka bahan dasar seperti ini kamu tahu.

ATURAN LAIN:

1. Jawab hanya seputar kebugaran, gizi, olahraga, tidur, dan kesehatan yang berkaitan. Topik lain ditolak singkat, lalu tawarkan kembali ke topik itu.
2. Kamu bukan dokter. Begitu muncul gejala, nyeri, obat, atau dugaan penyakit, arahkan ke tenaga kesehatan, jangan mendiagnosa.
3. Jangan pernah menyarankan makan di bawah jatah, mengurangi jatah, atau menambah defisit. Jatah itu sudah ditahan di batas aman menurut pedoman NIH/NHLBI, dan mengecilkannya berbahaya. Kalau target tidak tercapai tepat waktu, cuma dua tuas yang boleh kamu sebut: tambah gerak (langkah atau olahraga, angkanya dari DATA kalau ada) atau geser tanggal target.
4. Kalau DATA berlawanan dengan tebakan umum, ikuti DATA.
5. Perhatikan jam di DATA. Pagi hari catatan makan dan minum masih kosong itu wajar, bukan tanda dia tidak makan.

GAYA BICARA:

6. Ikuti bahasa dia. Kalau dia pakai gua/lu, kamu juga gua/lu. Kalau dia pakai aku/kamu, ikuti. Jangan pernah pakai "saya" atau "Anda".
7. Langsung ke isi. Tanpa "Maaf,", "Tentu!", "Baik,". Tanpa penutup "Semangat!", "Semoga membantu", atau ajakan bertanya lagi. Kalau isinya sudah selesai, berhenti.
8. Jawab yang ditanya saja. Ditanya protein, jangan melebar ke tidur dan langkah.
9. Kalimat pendek, seperti chat ke teman yang paham gizi. Sekitar 60 sampai 120 kata, lebih panjang hanya kalau dia minta rinci.
10. Jangan pakai tanda pisah em dash. Pakai koma, titik, atau tanda kurung.
11. Teks biasa tanpa markdown: tidak ada bintang, tidak ada tanda pagar. Kalau perlu daftar, tanda hubung di awal baris.
12. Satuan kalori ditulis "kkal". Tulis "sekitar", bukan simbol kira-kira. Jangan pakai simbol panah. Ribuan pakai titik (1.695), desimal pakai koma (0,6).

CONTOH GAYA YANG BENAR:

User: target protein gua 174 g, gimana nyampenya
Asisten: 174 g itu besar, jadi tiap makan harus ada satu sumber protein padat. Kira-kira begini:
- 250 g dada ayam, sekitar 77 g
- 200 g tempe, sekitar 38 g
- 3 telur, sekitar 19 g
- 1 scoop whey, sekitar 25 g
Totalnya sekitar 159 g, sisanya ketutup dari nasi dan susu. Semua itu sekitar 1.100 kkal, masih muat di jatah lu.

User: kenapa berat gua naik padahal defisit
Asisten: Naik 0,6 kg dalam seminggu dengan defisit rata-rata 400 kkal hampir pasti air, bukan lemak. Lemak butuh surplus sekitar 4.600 kkal untuk naik segitu, dan catatan lu tidak menunjukkan itu. Pemicu paling umum: makan asin kemarin, karbo lebih banyak dari biasa, atau kurang tidur. Lihat tren dua minggu, bukan dua hari.`;

const angka = (n: number): string => n.toLocaleString('id-ID');

const menit = (m: number): string => `${Math.floor(m / 60)} jam ${m % 60} menit`;

const MEAL_LABEL: Record<FoodLogRecord['meal_type'], string> = {
  BREAKFAST: 'Sarapan',
  LUNCH: 'Makan siang',
  DINNER: 'Makan malam',
  SNACK: 'Camilan',
};

/**
 * Jam WIB saat ini, "06:12". Tanggal saja tidak cukup: kalori masuk 0 pada
 * jam enam pagi itu wajar, pada jam sepuluh malam itu tanda dia tidak makan,
 * dan tanpa jam model tidak bisa membedakan keduanya.
 */
const jamWIB = (): string =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

/** Nama item di satu sesi makan, dari ai_analysis. Kosong kalau bentuk lamanya tidak dikenal. */
const namaItem = (log: FoodLogRecord): string => {
  const a = log.ai_analysis as Partial<FoodAnalysis> | null;
  if (!a || !Array.isArray(a.items)) return '';
  return a.items.map((i) => (i.portions > 1 ? `${i.name} ${i.portions} porsi` : i.name)).join(', ');
};

/**
 * Fakta yang dikirim ke model, sudah dihitung backend.
 *
 * Sengaja padat. Setiap barisnya ikut terkirim pada SETIAP giliran percakapan,
 * jadi baris yang tidak berguna dibayar berulang kali. Nilai yang kosong
 * ditulis "belum dicatat", BUKAN nol: "Tidur 0 jam" terbaca sebagai dia tidak
 * tidur semalam, padahal cuma belum mengisi.
 */
export const susunFakta = (
  harian: summaryService.DailySummary,
  pekan: summaryService.PeriodSummary,
  riwayat: summaryService.HistorySummary,
  profil: usersService.ProfileWithDerived | null,
  goal: goalsService.GoalWithProgress | null,
  makanan: foodService.FoodDay | null,
  badan: BodyComparisonRecord | null,
  jam: string = jamWIB(),
): string => {
  const b: string[] = [];

  b.push(`Sekarang: ${harian.date} pukul ${jam} WIB.`);

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

  // Tujuannya. Tanpa ini model tahu jatah tapi tidak tahu untuk apa jatah itu,
  // dan tidak bisa menjawab "gua bakal nyampe target tepat waktu nggak".
  b.push('');
  if (goal) {
    b.push('TARGET BERAT:');
    b.push(
      `Target ${toNumber(goal.target_weight_kg)} kg pada ${goal.target_date}, sisa ${goal.days_remaining} hari.`,
    );
    if (goal.remaining_kg !== null) {
      b.push(
        goal.remaining_kg > 0
          ? `Masih ${goal.remaining_kg} kg lagi.`
          : `Target sudah terlewati ${Math.abs(goal.remaining_kg)} kg.`,
      );
    }
    const p = goal.plan;
    if (p) {
      b.push(
        `Rencana: defisit ${angka(p.daily_deficit)} kkal per hari, laju ${p.weekly_rate_kg} kg per minggu (batas aman ${p.safe_weekly_rate_kg} kg per minggu).`,
      );
      if (p.achievable) {
        b.push('Dengan jatah ini targetnya tercapai tepat waktu.');
      } else if (p.projected_days !== null) {
        b.push(
          `Target tanggal itu TIDAK tercapai dengan jatah yang aman. Perkiraan realistis: ${p.projected_days} hari dari sekarang.${p.extra_steps_needed > 0 ? ` Atau tambah ${angka(p.extra_steps_needed)} langkah per hari.` : ''}`,
        );
      } else {
        b.push('Target ini tidak akan tercapai dengan jatah yang aman.');
      }
    }
  } else {
    b.push('Belum ada target berat badan aktif.');
  }

  b.push('');
  b.push('HARI INI:');
  if (harian.calories_in > 0) {
    b.push(
      `Kalori masuk ${angka(harian.calories_in)} kkal, protein ${harian.protein_g} g, karbohidrat ${harian.carbs_g} g, lemak ${harian.fat_g} g.`,
    );
  } else {
    b.push('Belum ada catatan makan hari ini.');
  }
  if (makanan && makanan.logs.length > 0) {
    b.push('Yang sudah dimakan:');
    for (const log of makanan.logs) {
      const nama = namaItem(log);
      b.push(
        `- ${MEAL_LABEL[log.meal_type]}: ${nama || 'tanpa rincian'} (${angka(log.total_calories)} kkal, protein ${Math.round(toNumber(log.protein_g))} g)`,
      );
    }
  }
  b.push(`Kalori keluar ${angka(harian.calories_out)} kkal.`);
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
    b.push('Jatah kalorinya belum ada karena belum ada target aktif.');
  }
  b.push(harian.steps > 0 ? `Langkah ${angka(harian.steps)}.` : 'Langkah belum dicatat.');
  b.push(harian.water_ml > 0 ? `Minum ${angka(harian.water_ml)} ml.` : 'Minum belum dicatat.');
  b.push(
    harian.sleep_minutes > 0 ? `Tidur ${menit(harian.sleep_minutes)}.` : 'Tidur belum dicatat.',
  );
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
  if (pekan.weight_change_kg === null) {
    b.push('Penimbangannya belum cukup untuk melihat perubahan berat.');
  } else if (pekan.weight_change_kg === 0) {
    // Satu penimbangan saja juga jatuh ke sini; "tetap 0 kg dari 96 ke 96"
    // cuma membingungkan.
    b.push(`Berat tetap di ${pekan.weight_end} kg.`);
  } else {
    const arah = pekan.weight_change_kg < 0 ? 'turun' : 'naik';
    b.push(
      `Berat ${arah} ${Math.abs(pekan.weight_change_kg)} kg (dari ${pekan.weight_start} ke ${pekan.weight_end} kg).`,
    );
  }

  // Defisit mingguan dari riwayat, dihitung HANYA dari hari yang makannya
  // tercatat. Angka yang sama dengan halaman riwayat kalori, supaya chat dan
  // layar tidak menyebut dua defisit berbeda untuk minggu yang sama.
  const r = riwayat.summary;
  if (r.days_logged > 0) {
    const arah = r.avg_balance >= 0 ? 'defisit' : 'surplus';
    b.push(
      `Dari ${r.days_logged} hari yang makannya tercatat: rata-rata masuk ${angka(r.avg_calories_in)} kkal, keluar ${angka(r.avg_calories_out)} kkal, ${arah} rata-rata ${angka(Math.abs(r.avg_balance))} kkal per hari. Defisit pada ${r.deficit_days} dari ${r.days_logged} hari itu.`,
    );
  } else {
    b.push('Belum ada hari dengan catatan makan minggu ini.');
  }
  b.push(
    pekan.avg_steps > 0
      ? `Rata-rata langkah ${angka(pekan.avg_steps)} per hari.`
      : 'Langkah belum dicatat minggu ini.',
  );
  b.push(
    pekan.avg_sleep_minutes > 0
      ? `Rata-rata tidur ${menit(Math.round(pekan.avg_sleep_minutes))} per malam.`
      : 'Tidur belum dicatat minggu ini.',
  );
  b.push(`Olahraga total ${pekan.total_workout_minutes} menit.`);
  b.push(`Dia mencatat sesuatu pada ${pekan.days_logged} dari ${pekan.days} hari.`);

  // Kesan AI terakhir dari perbandingan foto badan, kalau pernah diminta.
  // Ini pendapat yang sudah dilihat user, jadi saran di chat bisa menyambung
  // ke sana. Ditandai jelas sebagai kesan visual, bukan pengukuran.
  if (badan) {
    const pinggang =
      badan.waist_from_cm && badan.waist_to_cm
        ? ` Lingkar pinggang ${badan.waist_from_cm} cm jadi ${badan.waist_to_cm} cm.`
        : '';
    b.push(
      `Kesan visual AI dari foto badan ${badan.from_date} ke ${badan.to_date} (pendapat, bukan ukuran): ${badan.opinion}${pinggang}`,
    );
  }

  return b.join('\n');
};

/** Prompt sistem utuh: aturan lalu data. Diekspor untuk uji manual smoke:chat. */
export const susunPromptSistem = (fakta: string): string => `${ATURAN}\n\nDATA:\n${fakta}`;

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
 * Merapikan balasan model: tanda pisah, markdown, dan simbol matematika.
 *
 * Aturan di prompt sudah melarang semuanya, dan model tetap memakainya. Itu
 * memang sifat prompt: bujukan, bukan jaminan. Satu-satunya cara memastikannya
 * adalah memeriksa hasilnya di sini.
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
 *
 * Simbol kira-kira jadi kata "sekitar", panah jadi titik dua, "kcal" jadi
 * "kkal", dan ribuan yang dipisah spasi (1 695) jadi titik. Semuanya terlihat
 * di smoke:chat setelah aturan 12 ditulis, jadi aturannya jelas tidak cukup.
 */
export const rapikanBalasan = (teks: string): string =>
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
    .replace(/^#{1,6} +/gm, '')
    // u2248 kira-kira, u2192 panah kanan.
    // \s, bukan spasi biasa: model menaruh spasi tak-terputus (u00a0) di
    // belakang simbolnya, dan itu yang membuat "sekitar  62" berspasi ganda.
    .replace(/\u2248\s*/g, 'sekitar ')
    .replace(/\s*\u2192\s*/g, ': ')
    .replace(/\bkcal\b/g, 'kkal')
    .replace(/(\d) (\d{3})(?!\d)/g, '$1.$2')
    // Dua spasi di ujung baris adalah pemutus baris markdown; di teks biasa
    // cuma sampah.
    .replace(/[ \t]+$/gm, '');

/**
 * Berapa pesan terakhir yang ikut dikirim ke model.
 *
 * Riwayatnya disimpan seluruhnya, tapi yang dikirim dibatasi. Setiap pesan lama
 * ikut terkirim pada SETIAP giliran, jadi percakapan tanpa batas membuat
 * biayanya tumbuh kuadratik dan cepat menabrak batas token per menit Groq.
 *
 * Dua belas, bukan dua puluh: lembar fakta sendiri sekitar 700 token, satu
 * giliran dengan riwayat penuh terukur 2.200 token, dan free tier cuma memberi
 * 8.000 token per menit. Enam tanya jawab terakhir cukup untuk menyambung
 * obrolan soal angka hari ini.
 */
const KONTEKS_MAKS = 12;

/** Seluruh riwayat percakapan user, urut dari yang paling lama. */
export const getHistory = async (userId: string): Promise<ChatMessageRecord[]> =>
  forUser(userId).list('chat_messages', { sort: ['created_at'], limit: -1 });

/**
 * Hanya pesan yang akan dikirim ke model, diambil dari yang terbaru lalu
 * dibalik. Sebelumnya seluruh riwayat ditarik tiap giliran cuma untuk dipotong
 * di Node, dan tarikannya ikut membesar bersama umur percakapan.
 */
const konteksTerakhir = async (userId: string): Promise<ChatMessageRecord[]> => {
  const terbaru = await forUser(userId).list('chat_messages', {
    sort: ['-created_at'],
    limit: KONTEKS_MAKS,
  });
  return terbaru.reverse();
};

export const clearHistory = async (userId: string): Promise<{ deleted: number }> => {
  const repo = forUser(userId);

  const pesan = await repo.list('chat_messages', { fields: ['id'], limit: -1 });

  // Dihapus bersamaan, bukan satu per satu. Setiap penghapusan adalah round-trip
  // HTTP ke Directus, dan percakapan panjang berarti puluhan kali latensi
  // ditumpuk hanya untuk satu ketukan tombol.
  await Promise.all(pesan.map((p) => repo.remove('chat_messages', p.id)));

  return { deleted: pesan.length };
};

/** Semua bahan lembar fakta, diambil sekaligus. Dipakai reply() dan smoke:chat. */
export const kumpulkanFakta = async (userId: string): Promise<string> => {
  const hariIni = todayInJakarta();

  const [harian, pekan, riwayat, profil, goal, makanan, badan] = await Promise.all([
    summaryService.getDaily(userId, hariIni),
    // Tanpa argumen, getWeekly memakai tujuh hari terakhir sampai hari ini.
    summaryService.getWeekly(userId),
    summaryService.getHistory(userId, 7),
    ambilProfil(userId),
    goalsService.getActive(userId),
    foodService.getToday(userId),
    forUser(userId).findOne('body_comparisons', { sort: ['-to_date', '-created_at'] }),
  ]);

  return susunFakta(harian, pekan, riwayat, profil, goal, makanan, badan);
};

export const reply = async (userId: string, pesanBaru: string): Promise<{ reply: string }> => {
  const [fakta, riwayat] = await Promise.all([kumpulkanFakta(userId), konteksTerakhir(userId)]);

  const sebelumnya: ChatMessage[] = riwayat.map((p) => ({
    role: p.role === 'ASSISTANT' ? 'assistant' : 'user',
    content: p.content,
  }));

  const percakapan: ChatMessage[] = [
    { role: 'system', content: susunPromptSistem(fakta) },
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
  const balasan = rapikanBalasan(await chatCompletion(percakapan));

  // Dua penulisan, jadi dibungkus unitOfWork: kalau menyimpan balasan gagal,
  // pesan user yang sudah tersimpan ikut dibatalkan.
  await unitOfWork(async (tx) => {
    const repo = forUser(userId, tx);

    await repo.create('chat_messages', { role: 'USER', content: pesanBaru });
    await repo.create('chat_messages', { role: 'ASSISTANT', content: balasan });
  });

  return { reply: balasan };
};
