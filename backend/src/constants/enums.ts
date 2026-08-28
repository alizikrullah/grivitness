/**
 * Sumber kebenaran semua enum GriviTness.
 *
 * Dipakai di tiga tempat sekaligus:
 *   1. directus/schema.ts, jadi dropdown choices di collection Directus
 *   2. *.validation.ts, jadi z.enum() yang memvalidasi request masuk
 *   3. types/, jadi tipe TypeScript
 *
 * Directus tidak punya tipe enum Postgres, jadi di database ini cuma kolom string.
 * Jaminan nilainya benar-benar ada di Zod, bukan di database. Karena itu setiap
 * field enum WAJIB divalidasi Zod sebelum menyentuh Directus.
 */

export const GENDER = ['MALE', 'FEMALE', 'OTHER'] as const;
export type Gender = (typeof GENDER)[number];

/**
 * Menentukan PAR sisa hari pada kalkulasi TDEE faktorial. Lihat CLAUDE.md section 8.
 *
 * PERHATIAN, artinya berubah sejak metode faktorial dipakai. Ini BUKAN lagi
 * "seberapa aktif kamu secara keseluruhan", melainkan "seberapa aktif kamu di
 * luar tidur, berjalan, dan olahraga", praktisnya: seperti apa pekerjaanmu.
 * Tidur, langkah, dan olahraga sudah punya potongan waktunya sendiri.
 */
export const ACTIVITY_LEVEL = [
  'SEDENTARY',
  'LIGHTLY_ACTIVE',
  'MODERATELY_ACTIVE',
  'VERY_ACTIVE',
  'EXTRA_ACTIVE',
] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVEL)[number];

/** Siapa yang menulis satu pesan di riwayat percakapan. */
export const CHAT_ROLE = ['USER', 'ASSISTANT'] as const;
export type ChatRole = (typeof CHAT_ROLE)[number];

export const MEAL_TYPE = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export type MealType = (typeof MEAL_TYPE)[number];

export const WORKOUT_INTENSITY = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type WorkoutIntensity = (typeof WORKOUT_INTENSITY)[number];

export const WORKOUT_CATEGORY = ['CARDIO', 'STRENGTH', 'FLEXIBILITY', 'SPORTS', 'OTHER'] as const;
export type WorkoutCategory = (typeof WORKOUT_CATEGORY)[number];

/**
 * PAR (Physical Activity Ratio) untuk SISA hari, jam yang tidak terpakai untuk
 * tidur, berjalan, atau olahraga.
 *
 * Kenapa bukan pengali 1.2/1.375/1.55/1.725/1.9 seperti dulu: angka-angka itu
 * konvensi yang beredar turun-temurun tanpa sumber primer, dan lebih parah lagi,
 * dia mendeskripsikan SELURUH hari. Begitu kalori olahraga dan langkah ikut
 * ditambahkan di atasnya, jam yang sama dihitung dua kali dan defisit user
 * terlihat lebih besar daripada yang sebenarnya.
 *
 * Sekarang 24 jam dibagi habis dan tiap potongan punya PAR sendiri, mengikuti
 * metode faktorial FAO/WHO/UNU, Human Energy Requirements (Roma 2001, terbit
 * 2004), bab 5 dan Annex 5. Karena jamnya dipartisi, dobel hitung bukan cuma
 * dihindari, memang tidak mungkin terjadi.
 *
 * Nilai di bawah adalah rata-rata tertimbang dari kegiatan yang mengisi sisa
 * hari: kerja, makan, memasak, mandi, beres-beres, bersantai. Dikalibrasi
 * supaya hari tanpa olahraga dengan langkah seadanya mendarat di 1.42, pas di
 * pita "sedentary or light activity lifestyle" (1.40–1.69) versi FAO/WHO.
 */
export const ACTIVITY_PAR: Record<ActivityLevel, number> = {
  SEDENTARY: 1.6,
  LIGHTLY_ACTIVE: 1.8,
  MODERATELY_ACTIVE: 2.05,
  VERY_ACTIVE: 2.35,
  EXTRA_ACTIVE: 2.7,
};

/**
 * Penjelasan tiap level dalam bahasa yang bisa dijawab user.
 *
 * Pertanyaan "seberapa aktif kamu?" hampir mustahil dijawab jujur, hampir
 * semua orang menaksir dirinya terlalu tinggi, dan satu tingkat saja meleset
 * menggeser TDEE ratusan kalori. Menyebut contoh pekerjaan membuat pertanyaannya
 * konkret, dan sekarang memang itu yang ditanyakan.
 */
export const ACTIVITY_LEVEL_LABEL: Record<ActivityLevel, string> = {
  SEDENTARY: 'Duduk hampir sepanjang hari (kantor, kerja dari rumah, sopir)',
  LIGHTLY_ACTIVE: 'Banyak berdiri, sesekali berpindah (guru, kasir, penjaga toko)',
  MODERATELY_ACTIVE: 'Banyak bergerak dan mengangkat ringan (perawat, pramusaji, montir)',
  VERY_ACTIVE: 'Kerja fisik hampir sepanjang hari (kurir, tukang, petani)',
  EXTRA_ACTIVE: 'Kerja fisik berat tanpa henti (buruh bangunan, kuli angkut, atlet)',
};
