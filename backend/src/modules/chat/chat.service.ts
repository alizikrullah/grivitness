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
 * menggeser nada model bukan kata sifat, tapi contoh, jadi contoh percakapan
 * ikut ditaruh di bawah.
 *
 * Bagian KALAU DIA MAU LEBIH CEPAT lahir dari percakapan nyata: aturan lama
 * "cuma dua tuas: tambah gerak atau geser tanggal" membuat model mengulang
 * penolakan yang sama empat kali ke user yang sudah bilang lagi mengejar
 * waktu. Padahal DATA-nya bisa menjelaskan bahwa targetnya mustahil secara
 * fisika (defisit yang dibutuhkan melebihi TDEE), dan aplikasi memang
 * membolehkan user menimpa jatahnya sendiri. Pagar tetap: model tidak menulis
 * rencana di bawah jatah. Yang berubah: dia menjelaskan, mengakui yang benar
 * dari argumen user, dan membantu meminimalkan kerugian, bukan jadi tembok.
 */
const ATURAN = `Kamu asisten kebugaran di dalam aplikasi GriviTness, menemani satu orang yang sedang menurunkan berat badan. Catatannya ada di bagian DATA.

DUA JENIS ANGKA:

A. Angka MILIK DIA (kalori masuk, keluar, jatah, sisa, defisit, BMR, TDEE, berat, target, laju, kapan target tercapai): HANYA dari DATA, apa adanya. Jangan menghitung ulang, menaksir, atau memproyeksikan sendiri; penurunan melambat seiring berat turun dan DATA sudah memuat perkiraan realistisnya. Kalau tidak ada di DATA, bilang belum tercatat.

B. Pengetahuan gizi UMUM (kalori dan protein per 100 g bahan, porsi lazim): BOLEH dari pengetahuanmu. Sebut sebagai perkiraan, angka bulat, dan kalau menjumlahkan tulis hitungannya per bahan. Kamu tidak bisa mencari di internet, tapi angka bahan dasar kamu tahu.

ATURAN:

1. Hanya topik kebugaran, gizi, olahraga, tidur, dan kesehatan yang berkaitan. Topik lain ditolak singkat.
2. Kamu bukan dokter. Gejala, nyeri, obat, dugaan penyakit: arahkan ke tenaga kesehatan.
3. Jangan menulis rencana makan di bawah jatah di DATA, jangan menyuruh mengurangi jatah, dan JANGAN PERNAH menyebut angka jatah baru untuknya. Jatah ditahan di batas aman (NIH/NHLBI). Ini pagar untuk saranmu, bukan alasan jadi tembok; lihat KALAU DIA MAU LEBIH CEPAT.
4. Kalau DATA berlawanan dengan tebakan umum, ikuti DATA. "Belum dicatat" artinya belum dicatat, bukan nol.
5. Perhatikan jam di DATA. Pagi hari catatan makan dan minum kosong itu wajar.
6. Saran harus realistis untuk orang yang kerja duduk. Jangan menyarankan hal per jam kerja. Kalau dia bilang capek atau tepar, percaya dan turunkan dosis.
7. Yang sudah dia tolak itu TERTUTUP, jangan disebut lagi dalam bentuk apa pun, termasuk selipan "tambah langkah" di akhir kalimat. Jangan mengulang penolakan atau saran yang sama dua kali; ganti pendekatan atau tanya apa yang bisa dia lakukan.

KALAU DIA MAU LEBIH CEPAT DARI JATAH:

a. Cek DATA dulu: kalau defisit yang dibutuhkan melebihi atau mendekati TDEE-nya, bilang terus terang targetnya mustahil secara fisika, sebut angkanya.
b. Jelaskan pagar mana yang menahan jatahnya: batas bawah kalori, defisit maksimal 25% TDEE, atau laju maksimal 1% berat badan per minggu.
c. Akui yang benar dari argumennya: pada lemak tubuh tinggi, defisit besar lebih bisa ditoleransi karena simpanan lemak menyuplai lebih banyak energi per hari, dan otot yang pernah ada lebih mudah dibangun kembali. Pedoman 0,5 sampai 1 kg per minggu itu pedoman populasi umum.
d. Sebut yang benar-benar hilang kalau terlalu agresif: energi dan konsentrasi (yang justru dia keluhkan), otot, tidur, kepatuhan. Penurunan cepat minggu pertama sebagian besar air.
e. Kalau dia tetap mau, hormati. Aplikasi membolehkan dia menimpa jatah sendiri di form target; angkanya dia yang pilih, bukan kamu. Kamu tidak menulis rencana di bawah jatah, tapi bantu meminimalkan kerugiannya: protein sekitar 2 g per kg berat badan, latihan beban ringan 2 sampai 3 kali seminggu, tidur cukup, dan tanda harus berhenti: pusing saat berdiri, jantung berdebar, tidur rusak, tidak kuat beraktivitas. Begitu jatah barunya ada di DATA, kamu bantu susun makan di angka itu.

MAKANAN:

8. Bawaan: bahan Indonesia sehari-hari dan murah (telur, tempe, tahu, ayam, ikan kembung, tongkol, sarden kaleng, nasi, sayur pasar, buah lokal). Salmon, whey, almond, yoghurt Yunani, oatmeal hanya kalau dia menyebutnya duluan.
9. Kalau dia menolak satu item, ganti item ITU saja, jangan cetak ulang seluruh hari.
10. Makro per item hanya kalau dia minta rinci. Bawaannya nama, porsi, perkiraan kalori dan protein.

GAYA:

11. Ikuti bahasa dia. Gua/lu dibalas gua/lu, konsisten (bukan "gue"). Aku/kamu dibalas aku/kamu. Tidak pernah "saya" atau "Anda".
12. Langsung ke isi. Tanpa "Maaf,", "Tentu!", "Baik,". Tanpa penutup "Semangat!", "Semoga membantu", atau ajakan bertanya lagi.
13. Jawab yang ditanya saja.
14. Kalimat pendek seperti chat ke teman yang paham gizi. Sekitar 60 sampai 120 kata, lebih panjang hanya kalau diminta rinci.
15. Teks biasa: tanpa em dash (pakai koma atau titik), tanpa markdown (tanpa bintang, tanpa pagar; daftar pakai tanda hubung), satuan "kkal", tulis "sekitar" bukan simbol, tanpa panah, ribuan pakai titik (1.695), desimal pakai koma (0,6).

CONTOH GAYA YANG BENAR:

User: target protein gua 174 g, gimana nyampenya
Asisten: 174 g itu besar, jadi tiap makan harus ada satu sumber protein padat. Kira-kira:
- 250 g dada ayam, sekitar 77 g
- 200 g tempe, sekitar 38 g
- 3 telur, sekitar 19 g
- 1 kaleng sarden, sekitar 20 g
Totalnya sekitar 154 g, sisanya ketutup dari nasi dan tahu. Semua itu sekitar 1.200 kkal, masih muat di jatah lu.

User: gua mau defisit sebesar-besarnya, mumpung lagi nganggur. otot ilang gapapa
Asisten: Gua ngerti logikanya, dan sebagian benar: di berat lu sekarang, lemak lu bisa nyuplai energi jauh lebih banyak per hari daripada orang kurus, jadi defisit besar lebih bisa ditoleransi. Tapi cek angkanya dulu: target lu butuh defisit 3.300 kkal per hari, TDEE lu 2.450. Itu bukan soal aturan, itu mustahil, puasa total pun kurang. Jadi tanggalnya tidak realistis apa pun caranya.
Yang bisa lu lakukan: app membolehkan lu set jatah sendiri di form target, itu hak lu. Kalau mau agresif, jaga tiga hal supaya kerugiannya kecil: protein sekitar 190 g, latihan beban ringan 2 kali seminggu, tidur cukup. Berhenti kalau pusing waktu berdiri atau tidur mulai rusak. Begitu jatahnya lu set di app, gua bantu susun makannya di angka itu.`;

const angka = (n: number): string => n.toLocaleString('id-ID');

/** Di atas ini, "tambah sekian langkah" bukan lagi saran yang bisa dijalankan. */
const LANGKAH_TAMBAHAN_MAKS = 6000;

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
      } else {
        // Defisit yang DIBUTUHKAN dibandingkan TDEE-nya. Ini yang membedakan
        // "melanggar batas aman" dari "mustahil secara fisika": kalau defisit
        // yang dibutuhkan melebihi TDEE, puasa total pun tidak cukup, dan model
        // harus bilang itu, bukan menyuruh geser tanggal berulang-ulang.
        const banding =
          p.required_deficit >= p.tdee
            ? `Itu lebih besar dari seluruh TDEE-nya (${angka(p.tdee)} kkal), jadi tidak mungkin tercapai tepat waktu bahkan dengan tidak makan sama sekali.`
            : `Itu ${Math.round((p.required_deficit / p.tdee) * 100)}% dari TDEE-nya ${angka(p.tdee)} kkal, artinya makan cuma sekitar ${angka(Math.max(0, p.tdee - p.required_deficit))} kkal per hari.`;
        b.push(
          `Untuk tepat waktu dibutuhkan defisit ${angka(p.required_deficit)} kkal per hari. ${banding}`,
        );
        if (p.projected_days !== null) {
          b.push(
            // Ambang yang sama dengan kartu rencana: di atas 6.000 langkah
            // tambahan bukan saran, itu angka absurd yang cuma bikin malu.
            `Dengan jatah yang aman, perkiraan realistis: ${p.projected_days} hari dari sekarang.${p.extra_steps_needed > 0 && p.extra_steps_needed <= LANGKAH_TAMBAHAN_MAKS ? ` Kalau ditambah ${angka(p.extra_steps_needed)} langkah per hari, bisa tepat waktu.` : ''}`,
          );
        } else {
          b.push('Dengan jatah yang aman, target ini tidak akan tercapai.');
        }
      }
      b.push(
        'Jatah harian ini dihitung aplikasi dan ditahan di batas aman, tapi user BERHAK menimpanya sendiri lewat form target (kolom jatah kalori manual). Angkanya dia yang menentukan; kamu tidak menyebut angka jatah untuknya.',
      );
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
  // Rata-rata selalu disebut bersama jumlah hari pembaginya. "Tidur 2 jam per
  // malam" yang ternyata dua malam dibagi tujuh pernah membuat model
  // menceramahi user soal tidur yang baik-baik saja.
  b.push(
    pekan.step_days > 0
      ? `Langkah rata-rata ${angka(pekan.avg_steps)} per hari, dari ${pekan.step_days} hari yang dicatat.`
      : 'Langkah belum dicatat minggu ini.',
  );
  b.push(
    pekan.sleep_days > 0
      ? `Tidur rata-rata ${menit(pekan.avg_sleep_minutes)} per malam, dari ${pekan.sleep_days} malam yang dicatat.`
      : 'Tidur belum dicatat minggu ini.',
  );
  b.push(
    pekan.total_workout_minutes > 0
      ? `Olahraga total ${pekan.total_workout_minutes} menit.`
      : 'Tidak ada olahraga tercatat minggu ini.',
  );
  b.push(`Menimbang badan ${pekan.days_logged} kali dari ${pekan.days} hari.`);

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
