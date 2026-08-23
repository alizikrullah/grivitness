import type { ActivityLevel, Gender, MealType, WorkoutCategory, WorkoutIntensity } from '@/types';

/**
 * Terjemahan enum backend ke bahasa yang dibaca user.
 *
 * Nilai enum tetap dikirim ke API dalam bentuk aslinya — yang berubah hanya
 * tampilannya. Menerjemahkan nilai sebelum dikirim akan ditolak Zod di backend.
 */
export const GENDER_LABEL: Record<Gender, string> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
  OTHER: 'Lainnya',
};

/**
 * Level aktivitas TIDAK lagi menanyakan seberapa sering kamu olahraga.
 *
 * Backend sekarang menghitung TDEE dengan membagi habis 24 jam: tidur, jam
 * berjalan, dan jam olahraga masing-masing punya potongan sendiri yang diambil
 * dari data yang kamu catat. Yang tersisa untuk ditanyakan cuma sisa harimu.
 *
 * Label lama ("Olahraga sedang 3-5 hari seminggu") jadi jebakan setelah
 * perubahan itu: user memilihnya karena rajin olahraga, lalu olahraganya
 * dihitung LAGI dari log — jam yang sama dibayar dua kali, tepat di pintu masuk
 * datanya. Karena itu pertanyaannya diganti jadi contoh pekerjaan, yang juga
 * jauh lebih bisa dijawab jujur; hampir semua orang menaksir keaktifannya
 * terlalu tinggi, dan satu tingkat meleset menggeser TDEE ratusan kalori.
 */
export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  SEDENTARY: 'Kerja duduk',
  LIGHTLY_ACTIVE: 'Banyak berdiri',
  MODERATELY_ACTIVE: 'Banyak bergerak',
  VERY_ACTIVE: 'Kerja fisik',
  EXTRA_ACTIVE: 'Kerja fisik berat',
};

export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  SEDENTARY: 'Kantor, kerja dari rumah, sopir',
  LIGHTLY_ACTIVE: 'Guru, kasir, penjaga toko',
  MODERATELY_ACTIVE: 'Perawat, pramusaji, montir',
  VERY_ACTIVE: 'Kurir, tukang, petani',
  EXTRA_ACTIVE: 'Buruh bangunan, kuli angkut, atlet',
};

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Sarapan',
  LUNCH: 'Makan siang',
  DINNER: 'Makan malam',
  SNACK: 'Camilan',
};

export const INTENSITY_LABEL: Record<WorkoutIntensity, string> = {
  LOW: 'Ringan',
  MEDIUM: 'Sedang',
  HIGH: 'Berat',
};

export const CATEGORY_LABEL: Record<WorkoutCategory, string> = {
  CARDIO: 'Kardio',
  STRENGTH: 'Kekuatan',
  FLEXIBILITY: 'Kelenturan',
  SPORTS: 'Olahraga',
  OTHER: 'Lainnya',
};

export const SCORE_LABEL: Record<'mood' | 'energy' | 'sleep', Record<number, string>> = {
  mood: { 1: 'Sangat buruk', 2: 'Buruk', 3: 'Biasa', 4: 'Baik', 5: 'Sangat baik' },
  energy: { 1: 'Sangat lelah', 2: 'Lelah', 3: 'Cukup', 4: 'Berenergi', 5: 'Sangat berenergi' },
  sleep: { 1: 'Sangat buruk', 2: 'Buruk', 3: 'Cukup', 4: 'Nyenyak', 5: 'Sangat nyenyak' },
};

export const GENDER_OPTIONS = Object.keys(GENDER_LABEL) as Gender[];
export const ACTIVITY_OPTIONS = Object.keys(ACTIVITY_LABEL) as ActivityLevel[];
export const MEAL_OPTIONS = Object.keys(MEAL_LABEL) as MealType[];
export const INTENSITY_OPTIONS = Object.keys(INTENSITY_LABEL) as WorkoutIntensity[];
export const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as WorkoutCategory[];
