/**
 * Tipe TypeScript untuk seluruh collection Directus.
 *
 * Dipasang sebagai generic di createDirectus<DirectusSchema>() supaya semua
 * pemanggilan readItems/createItem/updateItem ter-autocomplete dan ter-typecheck.
 * Ini yang menggantikan peran tipe hasil generate Prisma.
 *
 * Harus dijaga selaras dengan directus/schema.ts secara manual — tidak ada
 * generator otomatis. Setiap kali menambah field di sana, tambahkan juga di sini.
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

// ============================================================
// USER & AUTH
// ============================================================

export interface UserRecord {
  id: string;
  email: string;
  /** Hash bcrypt. JANGAN pernah dimasukkan ke response API. */
  password_hash: string;
  name: string;
  directus_user_id: string | null;
  created_at: TimestampString;
  updated_at: TimestampString;
}

export interface RefreshTokenRecord {
  id: string;
  user_id: string;
  /** SHA-256 hex dari refresh token. Token mentah tidak pernah disimpan. */
  token_hash: string;
  expires_at: TimestampString;
  revoked_at: TimestampString | null;
  user_agent: string | null;
  created_at: TimestampString;
}

export interface UserProfileRecord {
  id: string;
  user_id: string;
  height_cm: DecimalString;
  birth_date: DateString;
  gender: Gender;
  activity_level: ActivityLevel;
  created_at: TimestampString;
  updated_at: TimestampString;
}

// ============================================================
// GOAL
// ============================================================

export interface GoalRecord {
  id: string;
  user_id: string;
  target_weight_kg: DecimalString;
  target_date: DateString;
  daily_calorie_budget: number;
  is_active: boolean;
  created_at: TimestampString;
  updated_at: TimestampString;
}

// ============================================================
// DAILY LOGS
// ============================================================

export interface WeightLogRecord {
  id: string;
  user_id: string;
  weight_kg: DecimalString;
  logged_at: DateString;
  user_date_key: string;
  notes: string | null;
  created_at: TimestampString;
}

export interface BodyPhotoRecord {
  id: string;
  user_id: string;
  front_photo_url: string;
  side_photo_url: string;
  front_directus_file_id: string | null;
  side_directus_file_id: string | null;
  ai_analysis: Record<string, unknown> | null;
  logged_at: DateString;
  user_date_key: string;
  created_at: TimestampString;
}

export interface FoodLogRecord {
  id: string;
  user_id: string;
  photo_url: string;
  directus_file_id: string | null;
  meal_type: MealType;
  ai_analysis: Record<string, unknown>;
  total_calories: number;
  protein_g: DecimalString;
  carbs_g: DecimalString;
  fat_g: DecimalString;
  notes: string | null;
  logged_at: TimestampString;
  created_at: TimestampString;
}

export interface WorkoutLogRecord {
  id: string;
  user_id: string;
  workout_library_id: string | null;
  custom_workout_id: string | null;
  workout_name: string;
  duration_minutes: number;
  calories_burned: number;
  intensity: WorkoutIntensity;
  notes: string | null;
  logged_at: DateString;
  created_at: TimestampString;
}

export interface StepLogRecord {
  id: string;
  user_id: string;
  steps: number;
  distance_km: DecimalString;
  calories_burned: number;
  logged_at: DateString;
  user_date_key: string;
  created_at: TimestampString;
}

export interface SleepLogRecord {
  id: string;
  user_id: string;
  sleep_start: TimestampString;
  sleep_end: TimestampString;
  duration_minutes: number;
  /** 1 sampai 5. Dijamin Zod, bukan database. */
  quality_score: number;
  notes: string | null;
  logged_at: DateString;
  created_at: TimestampString;
}

export interface WaterLogRecord {
  id: string;
  user_id: string;
  amount_ml: number;
  logged_at: TimestampString;
  created_at: TimestampString;
}

export interface BodyMeasurementRecord {
  id: string;
  user_id: string;
  waist_cm: DecimalString | null;
  hips_cm: DecimalString | null;
  chest_cm: DecimalString | null;
  left_arm_cm: DecimalString | null;
  right_arm_cm: DecimalString | null;
  left_thigh_cm: DecimalString | null;
  right_thigh_cm: DecimalString | null;
  logged_at: DateString;
  user_date_key: string;
  created_at: TimestampString;
}

export interface MoodLogRecord {
  id: string;
  user_id: string;
  /** 1 sampai 5. Dijamin Zod, bukan database. */
  mood_score: number;
  /** 1 sampai 5. Dijamin Zod, bukan database. */
  energy_score: number;
  notes: string | null;
  logged_at: DateString;
  created_at: TimestampString;
}

// ============================================================
// STREAK & NOTIFICATIONS
// ============================================================

export interface StreakRecord {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_logged_date: DateString | null;
  updated_at: TimestampString;
}

export interface NotificationSettingsRecord {
  id: string;
  user_id: string;
  expo_push_token: string | null;
  weight_reminder_enabled: boolean;
  /** Format HH:mm, timezone WIB. */
  weight_reminder_time: string;
  water_reminder_enabled: boolean;
  water_reminder_interval_hours: number;
  workout_reminder_enabled: boolean;
  workout_reminder_time: string;
  photo_reminder_enabled: boolean;
  photo_reminder_time: string;
  created_at: TimestampString;
  updated_at: TimestampString;
}

// ============================================================
// WORKOUT LIBRARY
// ============================================================

export interface WorkoutLibraryRecord {
  id: string;
  name: string;
  category: WorkoutCategory;
  /** Estimasi untuk berat badan 70kg, di-scale backend sesuai berat user. */
  calories_burned_per_minute: DecimalString;
  description: string | null;
  created_at: TimestampString;
}

export interface CustomWorkoutRecord {
  id: string;
  user_id: string;
  name: string;
  category: WorkoutCategory;
  calories_burned_per_minute: DecimalString;
  description: string | null;
  created_at: TimestampString;
}

// ============================================================
// SCHEMA GABUNGAN
// ============================================================

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
  sleep_logs: SleepLogRecord[];
  water_logs: WaterLogRecord[];
  body_measurements: BodyMeasurementRecord[];
  mood_logs: MoodLogRecord[];
  streaks: StreakRecord[];
  notification_settings: NotificationSettingsRecord[];
  workout_library: WorkoutLibraryRecord[];
  custom_workouts: CustomWorkoutRecord[];
}
