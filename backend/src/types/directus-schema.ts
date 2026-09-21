/**
 * BERKAS INI DI-GENERATE OTOMATIS, JANGAN DIEDIT MANUAL.
 *
 * Sumbernya: directus/schema.ts
 * Perintah  : npm run schema:types
 *
 * Perubahan apa pun di sini akan tertimpa saat generator dijalankan lagi.
 * Untuk menambah atau mengubah field, edit directus/schema.ts lalu jalankan
 * `npm run schema:types` dan `npm run schema:apply`.
 */

import type {
  ActivityLevel,
  Gender,
  MealType,
  WorkoutCategory,
  WorkoutIntensity,
} from '../constants/enums.js';

/**
 * Kolom decimal dikembalikan Directus sebagai STRING, bukan number.
 * Sudah diverifikasi langsung ke instance: weight_kg 82.55 terbaca "82.55".
 *
 * Jangan pernah dipakai aritmetika langsung. Konversi dulu dengan toNumber()
 * dari utils/number.ts. Lihat CLAUDE.md section 13.
 */
export type DecimalString = string;

/** Tanggal tanpa jam, format YYYY-MM-DD. */
export type DateString = string;

/** Timestamp ISO 8601 dengan timezone. */
export type TimestampString = string;

/** Akun aplikasi GriviTness. Terpisah dari directus_users, ini yang dipakai auth backend. */
export interface UserRecord {
  id: string;
  /** Dipakai sebagai identitas login */
  email: string;
  /** Hash bcrypt. JANGAN pernah dikirim ke client. */
  password_hash: string;
  name: string;
  /** Id di directus_users, diisi kalau DIRECTUS_SYNC_USERS=true */
  directus_user_id: string | null;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
  /** Diisi otomatis oleh Directus setiap item diubah */
  updated_at: TimestampString | null;
}

/** Refresh token aktif per device. Dipakai untuk rotasi dan revoke saat logout. */
export interface RefreshTokenRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** SHA-256 hex dari refresh token. Token mentah tidak pernah disimpan. */
  token_hash: string;
  expires_at: TimestampString;
  /** Terisi saat logout atau saat token dirotasi */
  revoked_at: TimestampString | null;
  /** Untuk membedakan session mobile dan web */
  user_agent: string | null;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Data fisik user. Dipisah dari users supaya tabel auth tetap lean. */
export interface UserProfileRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** Tinggi badan dalam sentimeter */
  height_cm: DecimalString;
  /** Dipakai menghitung usia untuk rumus BMR */
  birth_date: DateString;
  gender: Gender;
  /** Menentukan activity multiplier pada kalkulasi TDEE */
  activity_level: ActivityLevel;
  /**
   * Target langkah harian pilihan user. Kosong berarti bawaan 8.000 (6.000 untuk 60+).
   * Langkah cuma pantauan, jadi targetnya milik user, bukan rumus.
   */
  step_target: number | null;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
  /** Diisi otomatis oleh Directus setiap item diubah */
  updated_at: TimestampString | null;
}

/** Target berat badan user. Hanya boleh satu yang is_active, di-enforce di service layer. */
export interface GoalRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  target_weight_kg: DecimalString;
  target_date: DateString;
  /** Dihitung dari TDEE dikurangi defisit, bisa di-override manual */
  daily_calorie_budget: number;
  /** Hanya satu goal aktif per user */
  is_active: boolean;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
  /** Diisi otomatis oleh Directus setiap item diubah */
  updated_at: TimestampString | null;
}

/** Berat badan harian. Satu baris per user per hari. */
export interface WeightLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  weight_kg: DecimalString;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /**
   * Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung
   * Directus. Diisi backend, jangan diedit manual.
   */
  user_date_key: string;
  /** Catatan bebas dari user */
  notes: string | null;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Foto badan tampak depan dan samping. Satu baris per user per hari. */
export interface BodyPhotoRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  front_photo_url: string;
  side_photo_url: string;
  /** File foto tampak depan di Directus storage */
  front_directus_file_id: string | null;
  /** File foto tampak samping di Directus storage */
  side_directus_file_id: string | null;
  /** Raw JSON hasil analisa Groq Vision, disimpan utuh */
  ai_analysis: Record<string, unknown> | null;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /**
   * Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung
   * Directus. Diisi backend, jangan diedit manual.
   */
  user_date_key: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Satu sesi makan: daftar item yang ditulis user, ditaksir AI, dihitung backend. Bisa
 * banyak per hari.
 */
export interface FoodLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** File foto makanan di Directus storage, kosong kalau dicatat tanpa foto */
  directus_file_id: string | null;
  meal_type: MealType;
  /**
   * Daftar item lengkap dengan hasil perkalian backend, nilai per 100 dari model, sumber
   * (PHOTO/TEXT), dan balasan model utuh
   */
  ai_analysis: Record<string, unknown>;
  /** Jumlah kalori semua item, dihitung backend. Kolom sendiri supaya gampang di-aggregate */
  total_calories: number;
  protein_g: DecimalString;
  carbs_g: DecimalString;
  fat_g: DecimalString;
  /** Pakai timestamp, bukan date, supaya urutan makan dalam sehari bisa di-sort */
  logged_at: TimestampString;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Log olahraga. Bisa banyak per hari. Sumbernya bisa dari library, custom workout, atau
 * input manual.
 */
export interface WorkoutLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** Terisi kalau olahraga dipilih dari library global */
  workout_library_id: string | null;
  /** Terisi kalau olahraga dipilih dari custom workout milik user */
  custom_workout_id: string | null;
  /** Selalu diisi sebagai display name, walau kedua FK di atas kosong */
  workout_name: string;
  /**
   * Menit gerak. Untuk olahraga REPS/HOLD diturunkan backend dari set x ulangan x detik per
   * ulangan, bisa 0 untuk sesi singkat.
   */
  duration_minutes: number;
  /** Jumlah set. Hanya untuk olahraga berukuran REPS atau HOLD. */
  sets: number | null;
  /** Ulangan per set. Hanya untuk olahraga berukuran REPS. */
  reps: number | null;
  /**
   * Beban tambahan per ulangan, mis. squat 40 kg. Kosong berarti berat badan sendiri.
   * Catatan progres, tidak masuk hitungan kalori.
   */
  load_kg: DecimalString | null;
  /** Detik tahan per set. Hanya untuk olahraga berukuran HOLD (plank). */
  hold_seconds: number | null;
  /**
   * MET: kkal_per_menit * durasi * (berat_user / 70). MANUAL: angka yang diketik user, mis.
   * dari jam tangan.
   */
  calories_burned: number;
  /**
   * Asal angka calories_burned. MANUAL tidak boleh dihitung ulang diam-diam saat durasi atau
   * berat berubah.
   */
  calories_source: 'MET' | 'MANUAL';
  intensity: WorkoutIntensity;
  /**
   * true kalau sesi ini SUDAH ikut terhitung di angka device_energy_logs hari itu. Dipakai
   * supaya kalorinya tidak dihitung dua kali.
   */
  tracked_by_device: boolean;
  /** Catatan bebas dari user */
  notes: string | null;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Langkah kaki harian dari pedometer. Satu baris per user per hari. */
export interface StepLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  steps: number;
  /** Estimasi dari tinggi badan: steps * tinggi_cm * 0.415 / 100000 */
  distance_km: DecimalString;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /**
   * Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung
   * Directus. Diisi backend, jangan diedit manual.
   */
  user_date_key: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Kalori keluar seharian menurut smartwatch user. Satu baris per user per hari. Angka ini
 * MENGGANTIKAN hitungan TDEE hari itu, bukan ditambahkan ke atasnya.
 */
export interface DeviceEnergyLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /**
   * Kalori TOTAL sehari, sudah termasuk metabolisme istirahat. Inilah yang dipakai summary.
   * Kalau user memasukkan kalori aktif, kolom ini HASIL TURUNAN dari active_kcal + bmr_kcal.
   */
  total_kcal: number;
  /**
   * Kalori AKTIF apa adanya dari perangkat, tanpa metabolisme istirahat. Terisi hanya kalau
   * itu yang dimasukkan user. Null berarti user memasukkan angka total langsung.
   */
  active_kcal: number | null;
  /**
   * BMR yang ditambahkan ke active_kcal untuk memperoleh total_kcal. Disimpan supaya angka
   * turunannya bisa ditelusuri kembali, bukan dipercaya begitu saja.
   */
  bmr_kcal: number | null;
  /** Nama perangkatnya, misalnya "Galaxy Watch". Sekadar keterangan. */
  source: string | null;
  /** Catatan bebas dari user */
  notes: string | null;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /**
   * Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung
   * Directus. Diisi backend, jangan diedit manual.
   */
  user_date_key: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Log tidur. Sengaja TIDAK unik per hari karena user bisa tidur siang juga. */
export interface SleepLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  sleep_start: TimestampString;
  sleep_end: TimestampString;
  /** Dihitung backend dari sleep_end - sleep_start */
  duration_minutes: number;
  /** 1 = sangat buruk sampai 5 = sangat baik. Divalidasi Zod. */
  quality_score: number;
  /** Catatan bebas dari user */
  notes: string | null;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Log minum air. Berkali-kali per hari, di-aggregate SUM saat summary. */
export interface WaterLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  amount_ml: number;
  /** Pakai timestamp supaya ada jam per tegukan */
  logged_at: TimestampString;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Lingkar pinggang, diukur 2-4 minggu sekali bersama foto badan. Satu baris per user per
 * hari.
 */
export interface BodyMeasurementRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** Lingkar pinggang dalam cm, diukur setinggi pusar */
  waist_cm: DecimalString;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /**
   * Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung
   * Directus. Diisi backend, jangan diedit manual.
   */
  user_date_key: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Kesan AI saat membandingkan foto badan dua tanggal. Pendapat berupa teks, BUKAN angka,
 * dan tidak pernah masuk hitungan.
 */
export interface BodyComparisonRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** Tanggal foto yang lebih lama */
  from_date: DateString;
  /** Tanggal foto yang lebih baru */
  to_date: DateString;
  /** Arah perubahan menurut model. Label, bukan ukuran. */
  direction: 'LEANER' | 'SAME' | 'FULLER' | 'UNCLEAR';
  /** Kesan model dalam bahasa Indonesia, beberapa kalimat */
  opinion: string;
  /** Lingkar pinggang pada from_date saat perbandingan dibuat, untuk riwayat */
  waist_from_cm: DecimalString | null;
  /** Lingkar pinggang pada to_date saat perbandingan dibuat, untuk riwayat */
  waist_to_cm: DecimalString | null;
  /** Balasan model utuh, untuk ditelusuri */
  ai_raw: Record<string, unknown> | null;
  /**
   * "{user_id}:{from_date}:{to_date}". Satu pendapat per pasangan tanggal, diperbarui kalau
   * diminta ulang.
   */
  pair_key: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Mood dan energi harian. Satu baris per user per hari. */
export interface MoodLogRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** 1 = sangat buruk sampai 5 = sangat baik. Divalidasi Zod. */
  mood_score: number;
  /** 1 = sangat lelah sampai 5 = sangat berenergi. Divalidasi Zod. */
  energy_score: number;
  /** Catatan bebas dari user */
  notes: string | null;
  /** Tanggal log dalam format YYYY-MM-DD */
  logged_at: DateString;
  /**
   * Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung
   * Directus. Diisi backend, jangan diedit manual.
   */
  user_date_key: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Riwayat percakapan dengan asisten AI. Satu percakapan berjalan per user, diurutkan
 * menurut created_at.
 */
export interface ChatMessageRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** USER kalau ditulis user, ASSISTANT kalau balasan model */
  role: 'USER' | 'ASSISTANT';
  /** Isi pesan apa adanya. Balasan model sudah dibersihkan tanda pisahnya sebelum disimpan. */
  content: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Rekap streak per user. Satu baris per user, dibuat otomatis saat register. */
export interface StreakRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  current_streak: number;
  longest_streak: number;
  /** Untuk cek apakah hari ini sudah dihitung */
  last_logged_date: DateString | null;
  /** Diisi otomatis oleh Directus setiap item diubah */
  updated_at: TimestampString | null;
}

/** Pengaturan reminder per user. Satu baris per user, dibuat otomatis saat register. */
export interface NotificationSettingsRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  /** Diisi client setelah user memberi izin notifikasi */
  expo_push_token: string | null;
  weight_reminder_enabled: boolean;
  /** Format HH:mm, timezone WIB */
  weight_reminder_time: string;
  water_reminder_enabled: boolean;
  /** Reminder minum air setiap N jam */
  water_reminder_interval_hours: number;
  workout_reminder_enabled: boolean;
  /** Format HH:mm, timezone WIB */
  workout_reminder_time: string;
  photo_reminder_enabled: boolean;
  /**
   * Tanggal dalam bulan (1-28) pengingat foto badan berbunyi. Bulanan, bukan harian: foto
   * badan berguna 2-4 minggu sekali, dan pengingat harian untuk itu cuma jadi gangguan.
   */
  photo_reminder_day: number;
  /** Format HH:mm, timezone WIB */
  photo_reminder_time: string;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
  /** Diisi otomatis oleh Directus setiap item diubah */
  updated_at: TimestampString | null;
}

/** Library olahraga global untuk semua user. Di-seed lewat npm run seed. */
export interface WorkoutLibraryRecord {
  id: string;
  name: string;
  category: WorkoutCategory;
  /**
   * Nilai MET dari Compendium of Physical Activities (Ainsworth dkk. 2011). Ini DATA
   * SUMBERNYA, calories_burned_per_minute cuma turunannya.
   */
  met: DecimalString | null;
  /**
   * Kalori BERSIH per menit untuk berat 70kg, diturunkan dari met lewat (MET-1) x 3.5 x 70 /
   * 200. Bersih artinya sudah dikurangi metabolisme istirahat, yang sudah ditanggung TDEE.
   * Backend men-scale sesuai berat user.
   */
  calories_burned_per_minute: DecimalString;
  /** TIME menit, REPS set x ulangan, HOLD set x detik. Menentukan bentuk form di client. */
  measure: 'TIME' | 'REPS' | 'HOLD';
  /**
   * Perkiraan detik satu ulangan untuk olahraga REPS, dipakai menurunkan menit gerak. Kosong
   * berarti bawaan 3 detik.
   */
  seconds_per_rep: number | null;
  description: string | null;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/** Library olahraga custom milik masing-masing user. */
export interface CustomWorkoutRecord {
  id: string;
  /** Pemilik data ini */
  user_id: string;
  name: string;
  category: WorkoutCategory;
  /**
   * Kalori BERSIH per menit untuk berat 70kg, di atas metabolisme istirahat. Skala yang sama
   * dengan workout_library supaya kedua sumber bisa dibandingkan.
   */
  calories_burned_per_minute: DecimalString;
  /** TIME menit, REPS set x ulangan, HOLD set x detik. Dipilih user saat membuat. */
  measure: 'TIME' | 'REPS' | 'HOLD';
  description: string | null;
  /** Diisi otomatis oleh Directus saat item dibuat */
  created_at: TimestampString | null;
}

/**
 * Collection yang setiap barisnya dimiliki seorang user, ditandai kolom user_id.
 * Diturunkan otomatis dari definisi schema.
 */
export type UserOwnedCollection =
  | 'refresh_tokens'
  | 'user_profiles'
  | 'goals'
  | 'weight_logs'
  | 'body_photos'
  | 'food_logs'
  | 'workout_logs'
  | 'step_logs'
  | 'device_energy_logs'
  | 'sleep_logs'
  | 'water_logs'
  | 'body_measurements'
  | 'body_comparisons'
  | 'mood_logs'
  | 'chat_messages'
  | 'streaks'
  | 'notification_settings'
  | 'custom_workouts';

/** Dipasang sebagai generic di createDirectus<DirectusSchema>() agar SDK ter-typecheck. */
export interface DirectusSchema {
  users: UserRecord[];
  refresh_tokens: RefreshTokenRecord[];
  user_profiles: UserProfileRecord[];
  goals: GoalRecord[];
  weight_logs: WeightLogRecord[];
  body_photos: BodyPhotoRecord[];
  food_logs: FoodLogRecord[];
  workout_logs: WorkoutLogRecord[];
  step_logs: StepLogRecord[];
  device_energy_logs: DeviceEnergyLogRecord[];
  sleep_logs: SleepLogRecord[];
  water_logs: WaterLogRecord[];
  body_measurements: BodyMeasurementRecord[];
  body_comparisons: BodyComparisonRecord[];
  mood_logs: MoodLogRecord[];
  chat_messages: ChatMessageRecord[];
  streaks: StreakRecord[];
  notification_settings: NotificationSettingsRecord[];
  workout_library: WorkoutLibraryRecord[];
  custom_workouts: CustomWorkoutRecord[];
}
