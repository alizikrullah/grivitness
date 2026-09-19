/**
 * Cerminan kontrak backend GriviTness.
 *
 * Kolom decimal dikembalikan Directus sebagai STRING, bukan number, dan backend
 * meneruskannya apa adanya. Karena itu field seperti weight_kg bertipe string
 * di sini juga, konversi lewat toNum() di utils/format sebelum dihitung.
 */
export type DecimalString = string;
export type DateString = string;
export type TimestampString = string;

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export type ActivityLevel =
  'SEDENTARY' | 'LIGHTLY_ACTIVE' | 'MODERATELY_ACTIVE' | 'VERY_ACTIVE' | 'EXTRA_ACTIVE';

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type WorkoutIntensity = 'LOW' | 'MEDIUM' | 'HIGH';
export type WorkoutCategory = 'CARDIO' | 'STRENGTH' | 'FLEXIBILITY' | 'SPORTS' | 'OTHER';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  created_at: string | null;
}

export interface AuthResult {
  user: PublicUser;
  access_token: string;
  refresh_token: string;
}

export interface Profile {
  id: string;
  height_cm: DecimalString;
  birth_date: DateString;
  gender: Gender;
  activity_level: ActivityLevel;
  /** Target langkah pilihan user, null berarti bawaan. */
  step_target: number | null;
  /**
   * Penjelasan activity_level dari backend, berupa contoh profesi.
   *
   * Sejak TDEE memakai metode faktorial, activity_level TIDAK lagi berarti
   * "seberapa aktif kamu", tidur dan olahraga sudah punya potongan waktunya
   * sendiri. Yang ditanyakan sekarang seperti apa sisa harimu.
   */
  activity_label: string;
  age: number;
  current_weight_kg: number | null;
  bmr: number | null;
  /**
   * TDEE hari biasa: tidur normal, gerak seadanya, tanpa olahraga.
   * Sudah dikoreksi pengukuran kalau datanya memadai.
   */
  tdee: number | null;
  observed_tdee: ObservedTdee | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface Goal {
  id: string;
  target_weight_kg: DecimalString;
  target_date: DateString;
  daily_calorie_budget: number;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Rencana penurunan berat badan yang dihitung backend.
 *
 * Disimulasikan hari per hari dengan BMR yang dihitung ulang dari berat badan
 * hari itu, bukan dibagi sekali di awal, karena makin ringan badan, makin
 * sedikit yang terbakar, dan defisit yang sama makin lambat hasilnya.
 */
export interface WeightPlan {
  daily_calorie_budget: number;
  /** Negatif berarti surplus, untuk target menaikkan berat badan. */
  daily_deficit: number;
  required_deficit: number;
  /** False kalau target cuma bisa dikejar dengan asupan di bawah batas aman. */
  achievable: boolean;
  tdee: number;
  weekly_rate_kg: number;
  safe_weekly_rate_kg: number;
  /** Berapa hari target sebenarnya tercapai pada budget yang aman. */
  projected_days: number | null;
  /** Langkah tambahan yang menutup sisa defisit kalau diet saja tidak cukup. */
  extra_steps_needed: number;
}

/** Kenapa TDEE terukur belum bisa dipakai. */
export type ObservedReason =
  | 'BELUM_CUKUP_HARI'
  | 'BELUM_CUKUP_TIMBANGAN'
  | 'RENTANG_TIMBANG_PENDEK'
  | 'CATATAN_MAKAN_KURANG'
  | 'HASIL_TIDAK_WAJAR';

/**
 * TDEE yang diukur dari catatan berat dan makanan user sendiri.
 *
 * Rumus cuma titik awal. Begitu datanya cukup, angkanya digeser ke arah yang
 * benar-benar terjadi pada tubuh user ini, karena Mifflin-St Jeor tahu soal
 * 498 orang di tahun 1990, dan tidak tahu apa-apa soal orang ini.
 */
export interface ObservedTdee {
  /** Yang dipakai: campuran pengukuran dan estimasi rumus. */
  tdee: number;
  /** Hasil murni rumus, sebelum dikoreksi. */
  estimated: number;
  /** Hasil murni pengukuran. Null selama datanya belum layak. */
  measured: number | null;
  /** 0 sampai 1, bobot pengukuran di dalam `tdee`. */
  confidence: number;
  reason: ObservedReason | null;
  days: number;
  logged_days: number;
  weigh_ins: number;
  weekly_rate_kg: number | null;
}

/** Goal aktif berikut turunannya. Semua dihitung ulang tiap kali dibaca. */
export interface GoalWithProgress extends Goal {
  current_weight_kg: number | null;
  remaining_kg: number | null;
  days_remaining: number;
  tdee: number | null;
  achievable: boolean | null;
  plan: WeightPlan | null;
  observed_tdee: ObservedTdee | null;
}

export interface WeightLog {
  id: string;
  weight_kg: DecimalString;
  logged_at: DateString;
  notes: string | null;
  created_at: string | null;
}

/** Langkah adalah pantauan, bukan bahan hitung kalori. Tidak ada kolom kalori. */
export interface StepLog {
  id: string;
  steps: number;
  distance_km: DecimalString;
  logged_at: DateString;
  created_at: string | null;
}

export interface WaterLog {
  id: string;
  amount_ml: number;
  logged_at: TimestampString;
  created_at: string | null;
}

export interface WaterDay {
  date: string;
  total_ml: number;
  logs: WaterLog[];
}

export interface SleepLog {
  id: string;
  sleep_start: TimestampString;
  sleep_end: TimestampString;
  duration_minutes: number;
  quality_score: number;
  notes: string | null;
  logged_at: DateString;
  created_at: string | null;
}

/**
 * Bentuk balasan GET /api/sleep/today dan /api/sleep?date=.
 *
 * Endpoint ini mengembalikan OBJEK berisi rekap dan daftarnya, bukan array
 * telanjang. Sempat salah ditulis sebagai SleepLog[] di sini, dan akibatnya
 * `.length` selalu undefined sehingga layar tidur tampak kosong terus padahal
 * datanya tersimpan. `get<T>()` cuma memberi tipe, tidak memeriksa isi, jadi
 * ketidakcocokan seperti ini lolos dari TypeScript dan baru terlihat di layar.
 */
export interface SleepDay {
  date: string;
  total_minutes: number;
  logs: SleepLog[];
}

export interface MoodLog {
  id: string;
  mood_score: number;
  energy_score: number;
  notes: string | null;
  logged_at: DateString;
  created_at: string | null;
}

/**
 * Cuma lingkar pinggang. Dari semua lingkar, hanya ini yang punya bukti kuat
 * dan hanya ini yang berguna saat timbangan macet. Diukur 2-4 minggu sekali
 * bersama foto badan, bukan harian.
 */
export interface BodyMeasurement {
  id: string;
  waist_cm: DecimalString;
  logged_at: DateString;
  created_at: string | null;
}

/** Satuan berat atau volume satu porsi. Minuman ditakar ml. */
export type FoodUnit = 'g' | 'ml';

/**
 * Satu makanan di dalam sesi makan, sesudah dihitung backend.
 *
 * Nama, jumlah porsi, dan satuan ditulis user dan tidak pernah diubah siapa
 * pun. Berat per porsi dari user atau taksiran model, ditandai asalnya. Nilai
 * per 100 dari model. Empat angka terakhir hasil perkalian backend.
 */
export interface FoodItem {
  name: string;
  portions: number;
  unit: FoodUnit;
  /** Berat atau volume SATU porsi. */
  weight_per_portion: number;
  weight_source: 'USER' | 'AI';
  /** Total yang dimakan: portions × weight_per_portion. */
  amount: number;
  kcal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** true kalau model tidak memberi nilai gizi untuk item ini; angkanya nol dan harus dicatat ulang. */
  nutrition_missing: boolean;
}

export interface FoodAnalysis {
  /** PHOTO kalau ditaksir dari foto, TEXT kalau dari tulisan saja. */
  source: 'PHOTO' | 'TEXT';
  items: FoodItem[];
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: string | null;
  /** Null tanpa foto. false kalau model melihat makanan yang jelas berbeda dari tulisan. */
  photo_matches: boolean | null;
  photo_note: string | null;
  user_edited: boolean;
}

export interface FoodLog {
  id: string;
  /** Null kalau dicatat tanpa foto. */
  photo_url: string | null;
  directus_file_id: string | null;
  meal_type: MealType;
  ai_analysis: FoodAnalysis;
  total_calories: number;
  protein_g: DecimalString;
  carbs_g: DecimalString;
  fat_g: DecimalString;
  logged_at: TimestampString;
  created_at: string | null;
}

export interface FoodDay {
  date: string;
  total_calories: number;
  total_protein_g: number;
  total_carbs_g: number;
  total_fat_g: number;
  logs: FoodLog[];
}

/** Kesan model atas foto badan satu tanggal. Kalimat, tanpa angka apa pun. */
export interface BodyAnalysis {
  posture_notes?: string;
  visible_changes?: string;
  recommendations?: string[];
}

/**
 * Arah perubahan menurut model saat membandingkan dua tanggal. Label untuk
 * pendapat, bukan ukuran; tidak pernah masuk hitungan.
 */
export type BodyDirection = 'LEANER' | 'SAME' | 'FULLER' | 'UNCLEAR';

/** Pendapat AI yang tersimpan untuk satu pasangan tanggal. */
export interface BodyComparison {
  id: string;
  from_date: DateString;
  to_date: DateString;
  direction: BodyDirection;
  opinion: string;
  /** Lingkar pinggang kedua tanggal saat pendapat dibuat, untuk riwayat. */
  waist_from_cm: DecimalString | null;
  waist_to_cm: DecimalString | null;
  created_at: string | null;
}

/** Satu sisi perbandingan: foto hari itu dan lingkar pinggangnya. */
export interface BodyComparisonSide {
  date: DateString;
  photo: BodyPhoto | null;
  waist_cm: DecimalString | null;
}

/** Tampilan dua tanggal berdampingan, plus pendapat AI kalau pernah diminta. */
export interface BodyComparisonView {
  from: BodyComparisonSide;
  to: BodyComparisonSide;
  comparison: BodyComparison | null;
}

export interface BodyPhoto {
  id: string;
  front_photo_url: string;
  side_photo_url: string;
  front_directus_file_id: string | null;
  side_directus_file_id: string | null;
  ai_analysis: BodyAnalysis | null;
  logged_at: DateString;
  created_at: string | null;
}

export interface WorkoutLog {
  id: string;
  workout_library_id: string | null;
  custom_workout_id: string | null;
  workout_name: string;
  duration_minutes: number;
  calories_burned: number;
  /**
   * Asal angka kalorinya. MET dihitung backend dari library; MANUAL diketik
   * user, biasanya dari jam tangan, dan tidak pernah dihitung ulang diam-diam.
   * Null cuma pada baris lama dari sebelum kolom ini ada, artinya MET.
   */
  calories_source: 'MET' | 'MANUAL' | null;
  intensity: WorkoutIntensity;
  /** true kalau sesi ini sudah ikut terhitung di angka smartwatch hari itu. */
  tracked_by_device: boolean;
  notes: string | null;
  logged_at: DateString;
  created_at: string | null;
}

export interface DeviceEnergyLog {
  id: string;
  /**
   * Kalori TOTAL sehari, sudah termasuk metabolisme istirahat. Inilah yang
   * dipakai ringkasan. Kalau user memasukkan kalori aktif, angka ini hasil
   * turunan dari active_kcal + bmr_kcal.
   */
  total_kcal: number;
  /** Kalori aktif apa adanya dari perangkat. Null kalau user memasukkan total. */
  active_kcal: number | null;
  /** BMR yang ditambahkan untuk memperoleh total. Null kalau user memasukkan total. */
  bmr_kcal: number | null;
  source: string | null;
  notes: string | null;
  logged_at: DateString;
  created_at: string | null;
}

export interface WorkoutDay {
  date: string;
  total_minutes: number;
  total_calories: number;
  logs: WorkoutLog[];
}

export interface WorkoutLibraryItem {
  id: string;
  name: string;
  category: WorkoutCategory;
  /**
   * Nilai MET dari Compendium of Physical Activities, DATA SUMBERNYA.
   * Null untuk baris lama yang belum di-seed ulang.
   */
  met: DecimalString | null;
  /** Kalori BERSIH per menit untuk berat 70kg, turunan dari met. */
  calories_burned_per_minute: DecimalString;
  description: string | null;
}

export interface CustomWorkout extends WorkoutLibraryItem {
  user_id: string;
}

export interface Streak {
  id: string;
  current_streak: number;
  longest_streak: number;
  last_logged_date: DateString | null;
  updated_at: string | null;
}

export interface NotificationSettings {
  id: string;
  expo_push_token: string | null;
  weight_reminder_enabled: boolean;
  weight_reminder_time: string;
  water_reminder_enabled: boolean;
  water_reminder_interval_hours: number;
  workout_reminder_enabled: boolean;
  workout_reminder_time: string;
  photo_reminder_enabled: boolean;
  /** Tanggal dalam bulan (1-28). Foto badan diingatkan bulanan, bukan harian. */
  photo_reminder_day: number;
  photo_reminder_time: string;
}

/**
 * Rincian dari mana pengeluaran energi hari itu datang.
 *
 * Langkah tidak dirinci karena tidak dihitung: jalan-jalan kecil sepanjang
 * hari sudah terwakili di baseline lewat PAR pekerjaan, dan jalan kaki yang
 * sungguhan dicatat sebagai olahraga. Langkah cuma pantauan.
 */
export interface EnergyBreakdown {
  /** Physical Activity Level hari itu, TDEE dibagi BMR. */
  pal: number;
  /** Metabolisme basal dikali PAL: hidup dan kegiatan sehari-hari. */
  baseline: number;
  workout_calories: number;
}

export interface SleepTarget {
  min_minutes: number;
  max_minutes: number;
}

export interface StepTarget {
  /** Total yang dianjurkan hari ini. Bawaan 8.000 (6.000 untuk 60+), atau pilihan user. */
  steps: number;
  /** true kalau angkanya pilihan user sendiri. */
  custom: boolean;
}

export interface MacroTarget {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Target harian yang diturunkan backend dari tubuh dan tujuan user.
 *
 * Menggantikan konstanta yang dulu ditulis langsung di layar, 2500ml, 8 jam,
 * 10.000 langkah, yang sama untuk semua orang dan tidak satu pun punya sumber.
 */
export interface DailyTargets {
  water_ml: number;
  sleep: SleepTarget;
  steps: StepTarget;
  /** Null selama belum ada goal aktif, karena makro butuh budget kalori. */
  macros: MacroTarget | null;
}

export interface DailySummary {
  date: string;
  weight_kg: number | null;
  calories_in: number;
  calories_out: number;
  /** Kalori keluar menurut smartwatch, kalau dicatat hari itu. */
  device_kcal: number | null;
  /** Dari mana calories_out diambil hari itu. */
  calories_out_source: 'formula' | 'device';
  calorie_budget: number | null;
  calories_remaining: number | null;
  /** Null selama profil belum diisi atau user belum pernah menimbang. */
  energy: EnergyBreakdown | null;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  steps: number;
  water_ml: number;
  sleep_minutes: number;
  workout_minutes: number;
  /** Kalori olahraga saja. calories_out juga memuat metabolisme dan langkah. */
  workout_calories: number;
  mood_score: number | null;
  energy_score: number | null;
  has_body_photo: boolean;
  targets: DailyTargets;
}

export interface PeriodSummary {
  from: string;
  to: string;
  days: number;
  weight_start: number | null;
  weight_end: number | null;
  weight_change_kg: number | null;
  total_calories_in: number;
  avg_calories_in: number;
  total_steps: number;
  avg_steps: number;
  total_water_ml: number;
  total_sleep_minutes: number;
  avg_sleep_minutes: number;
  total_workout_minutes: number;
  total_workout_calories: number;
  days_logged: number;
  /** Rata-rata kalori smartwatch dari hari yang dicatat saja. Bahan pembanding. */
  avg_device_kcal: number | null;
}
