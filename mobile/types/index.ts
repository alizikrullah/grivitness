/**
 * Cerminan kontrak backend GriviTness.
 *
 * Kolom decimal dikembalikan Directus sebagai STRING, bukan number, dan backend
 * meneruskannya apa adanya. Karena itu field seperti weight_kg bertipe string
 * di sini juga — konversi lewat toNum() di utils/format sebelum dihitung.
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
  age: number;
  current_weight_kg: number | null;
  bmr: number | null;
  tdee: number | null;
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

export interface WeightLog {
  id: string;
  weight_kg: DecimalString;
  logged_at: DateString;
  notes: string | null;
  created_at: string | null;
}

export interface StepLog {
  id: string;
  steps: number;
  distance_km: DecimalString;
  calories_burned: number;
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

export interface MoodLog {
  id: string;
  mood_score: number;
  energy_score: number;
  notes: string | null;
  logged_at: DateString;
  created_at: string | null;
}

export interface BodyMeasurement {
  id: string;
  waist_cm: DecimalString | null;
  hips_cm: DecimalString | null;
  chest_cm: DecimalString | null;
  left_arm_cm: DecimalString | null;
  right_arm_cm: DecimalString | null;
  left_thigh_cm: DecimalString | null;
  right_thigh_cm: DecimalString | null;
  logged_at: DateString;
  created_at: string | null;
}

export interface FoodAnalysis {
  foods_detected?: string[];
  total_calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  confidence?: 'low' | 'medium' | 'high';
}

export interface FoodLog {
  id: string;
  photo_url: string;
  directus_file_id: string | null;
  meal_type: MealType;
  ai_analysis: FoodAnalysis;
  total_calories: number;
  protein_g: DecimalString;
  carbs_g: DecimalString;
  fat_g: DecimalString;
  notes: string | null;
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

export interface BodyAnalysis {
  posture_notes?: string;
  visible_changes?: string;
  estimated_body_fat_percent?: number | null;
  recommendations?: string[];
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
  intensity: WorkoutIntensity;
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
  photo_reminder_time: string;
}

export interface DailySummary {
  date: string;
  weight_kg: number | null;
  calories_in: number;
  calories_out: number;
  calorie_budget: number | null;
  calories_remaining: number | null;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  steps: number;
  water_ml: number;
  sleep_minutes: number;
  workout_minutes: number;
  mood_score: number | null;
  energy_score: number | null;
  has_body_photo: boolean;
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
}
