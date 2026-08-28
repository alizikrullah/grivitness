/**
 * ============================================================
 * SUMBER KEBENARAN SCHEMA GriviTness
 * ============================================================
 *
 * File ini mendefinisikan seluruh collection, field, dan relasi di Directus.
 * Apply ke Directus dengan: npm run schema:apply
 *
 * JANGAN bikin atau ubah collection lewat UI Directus. Ubah di sini, lalu apply.
 * Rujukan data model lengkap dengan komentar ada di schema-reference.prisma.
 *
 * Catatan penting soal keterbatasan Directus dibanding ORM biasa:
 *
 * 1. Tidak ada tipe enum. Semua enum jadi kolom string dengan dropdown choices.
 *    Jaminan nilainya ada di Zod (`*.validation.ts`), bukan di database.
 *
 * 2. Tidak ada composite unique constraint. Collection yang butuh jaminan
 *    "satu baris per user per hari" memakai field turunan `user_date_key`
 *    berisi "{user_id}:{YYYY-MM-DD}" dengan unique constraint satu kolom.
 */

import {
  CHAT_ROLE,
  ACTIVITY_LEVEL,
  GENDER,
  MEAL_TYPE,
  WORKOUT_CATEGORY,
  WORKOUT_INTENSITY,
} from '../src/constants/enums.js';

// ============================================================
// TIPE DSL
// ============================================================

/** Subset tipe field Directus yang dipakai project ini. */
export type FieldType =
  'uuid' | 'string' | 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'timestamp' | 'json';

export interface RelationDef {
  /** Collection tujuan dari relasi many-to-one ini. */
  relatedCollection: string;
  onDelete: 'CASCADE' | 'SET NULL' | 'NO ACTION';
  /**
   * Nama field kebalikan (one-to-many) yang dibuat di collection tujuan.
   * Isi null kalau tidak perlu, misal relasi ke collection sistem Directus.
   */
  oneField?: string | null;
}

export interface FieldDef {
  field: string;
  type: FieldType;
  /** Default false, mayoritas field wajib diisi. */
  nullable?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  defaultValue?: string | number | boolean | null;
  maxLength?: number;
  /** Total digit untuk tipe decimal. */
  precision?: number;
  /** Digit di belakang koma untuk tipe decimal. */
  scale?: number;
  /** Pilihan nilai untuk field enum. Otomatis jadi dropdown di admin panel. */
  choices?: readonly string[];
  /** Flag khusus Directus, misal 'uuid', 'date-created', 'date-updated', 'file'. */
  special?: readonly string[];
  readonly?: boolean;
  hidden?: boolean;
  note?: string;
  relation?: RelationDef;
}

export interface CollectionDef {
  collection: string;
  /**
   * Nama interface TypeScript yang di-generate untuk collection ini.
   *
   * Ditulis eksplisit karena bentuk jamak ke tunggal tidak bisa ditebak dengan
   * aman: "notification_settings" tetap jadi NotificationSettingsRecord, bukan
   * NotificationSetting, dan "workout_library" memang sudah tunggal.
   */
  typeName: string;
  /** Nama icon Material Design untuk navigasi admin panel. */
  icon: string;
  note: string;
  fields: FieldDef[];
}

// ============================================================
// HELPER, menekan pengulangan definisi field
// ============================================================

/** Primary key UUID, di-generate otomatis oleh Directus. */
const pk = (): FieldDef => ({
  field: 'id',
  type: 'uuid',
  primaryKey: true,
  special: ['uuid'],
  readonly: true,
  hidden: true,
});

/** Diisi otomatis Directus saat item dibuat. Nullable karena diisi setelah insert. */
const createdAt = (): FieldDef => ({
  field: 'created_at',
  type: 'timestamp',
  nullable: true,
  special: ['date-created'],
  readonly: true,
  note: 'Diisi otomatis oleh Directus saat item dibuat',
});

/** Diisi otomatis Directus setiap item diupdate. */
const updatedAt = (): FieldDef => ({
  field: 'updated_at',
  type: 'timestamp',
  nullable: true,
  special: ['date-updated'],
  readonly: true,
  note: 'Diisi otomatis oleh Directus setiap item diubah',
});

/**
 * Relasi many-to-one ke collection users.
 * @param oneField nama field kebalikan yang muncul di collection users
 */
const userFk = (oneField: string, options: { unique?: boolean } = {}): FieldDef => ({
  field: 'user_id',
  type: 'uuid',
  unique: options.unique ?? false,
  note: 'Pemilik data ini',
  relation: { relatedCollection: 'users', onDelete: 'CASCADE', oneField },
});

/**
 * Pengganti composite unique @@unique([user_id, logged_at]).
 * Diisi backend dengan format "{user_id}:{YYYY-MM-DD}" lewat utils/daily-key.ts.
 * UUID 36 karakter + ':' + tanggal 10 karakter = 47, jadi 64 sudah cukup.
 */
const userDateKey = (): FieldDef => ({
  field: 'user_date_key',
  type: 'string',
  maxLength: 64,
  unique: true,
  hidden: true,
  note: 'Kunci unik "{user_id}:{YYYY-MM-DD}". Pengganti composite unique yang tidak didukung Directus. Diisi backend, jangan diedit manual.',
});

/** Tanggal log, tanpa jam. */
const loggedAtDate = (): FieldDef => ({
  field: 'logged_at',
  type: 'date',
  note: 'Tanggal log dalam format YYYY-MM-DD',
});

const enumField = (
  field: string,
  choices: readonly string[],
  options: { nullable?: boolean; defaultValue?: string; note?: string } = {},
): FieldDef => ({
  field,
  type: 'string',
  maxLength: 32,
  choices,
  nullable: options.nullable ?? false,
  ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
  ...(options.note !== undefined ? { note: options.note } : {}),
});

const decimalField = (
  field: string,
  precision: number,
  scale: number,
  options: { nullable?: boolean; note?: string } = {},
): FieldDef => ({
  field,
  type: 'decimal',
  precision,
  scale,
  nullable: options.nullable ?? false,
  ...(options.note !== undefined ? { note: options.note } : {}),
});

/** Relasi ke file di Directus storage. Nullable supaya file bisa dihapus dari admin panel. */
const fileFk = (field: string, note: string): FieldDef => ({
  field,
  type: 'uuid',
  nullable: true,
  special: ['file'],
  note,
  relation: { relatedCollection: 'directus_files', onDelete: 'SET NULL', oneField: null },
});

const notes = (): FieldDef => ({
  field: 'notes',
  type: 'text',
  nullable: true,
  note: 'Catatan bebas dari user',
});

// ============================================================
// DEFINISI COLLECTION
// ============================================================

export const collections: CollectionDef[] = [
  // ----------------------------------------------------------
  // USER & AUTH
  // ----------------------------------------------------------
  {
    collection: 'users',
    typeName: 'UserRecord',
    icon: 'person',
    note: 'Akun aplikasi GriviTness. Terpisah dari directus_users, ini yang dipakai auth backend.',
    fields: [
      pk(),
      {
        field: 'email',
        type: 'string',
        maxLength: 255,
        unique: true,
        note: 'Dipakai sebagai identitas login',
      },
      {
        field: 'password_hash',
        type: 'string',
        maxLength: 255,
        hidden: true,
        note: 'Hash bcrypt. JANGAN pernah dikirim ke client.',
      },
      { field: 'name', type: 'string', maxLength: 255 },
      {
        field: 'directus_user_id',
        type: 'uuid',
        nullable: true,
        unique: true,
        note: 'Id di directus_users, diisi kalau DIRECTUS_SYNC_USERS=true',
      },
      createdAt(),
      updatedAt(),
    ],
  },

  {
    collection: 'refresh_tokens',
    typeName: 'RefreshTokenRecord',
    icon: 'key',
    note: 'Refresh token aktif per device. Dipakai untuk rotasi dan revoke saat logout.',
    fields: [
      pk(),
      userFk('refresh_tokens'),
      {
        field: 'token_hash',
        type: 'string',
        maxLength: 64,
        unique: true,
        hidden: true,
        note: 'SHA-256 hex dari refresh token. Token mentah tidak pernah disimpan.',
      },
      { field: 'expires_at', type: 'timestamp' },
      {
        field: 'revoked_at',
        type: 'timestamp',
        nullable: true,
        note: 'Terisi saat logout atau saat token dirotasi',
      },
      {
        field: 'user_agent',
        type: 'string',
        maxLength: 255,
        nullable: true,
        note: 'Untuk membedakan session mobile dan web',
      },
      createdAt(),
    ],
  },

  {
    collection: 'user_profiles',
    typeName: 'UserProfileRecord',
    icon: 'badge',
    note: 'Data fisik user. Dipisah dari users supaya tabel auth tetap lean.',
    fields: [
      pk(),
      userFk('profile', { unique: true }),
      decimalField('height_cm', 5, 2, { note: 'Tinggi badan dalam sentimeter' }),
      { field: 'birth_date', type: 'date', note: 'Dipakai menghitung usia untuk rumus BMR' },
      enumField('gender', GENDER),
      enumField('activity_level', ACTIVITY_LEVEL, {
        note: 'Menentukan activity multiplier pada kalkulasi TDEE',
      }),
      createdAt(),
      updatedAt(),
    ],
  },

  // ----------------------------------------------------------
  // GOAL
  // ----------------------------------------------------------
  {
    collection: 'goals',
    typeName: 'GoalRecord',
    icon: 'flag',
    note: 'Target berat badan user. Hanya boleh satu yang is_active, di-enforce di service layer.',
    fields: [
      pk(),
      userFk('goals'),
      decimalField('target_weight_kg', 5, 2),
      { field: 'target_date', type: 'date' },
      {
        field: 'daily_calorie_budget',
        type: 'integer',
        note: 'Dihitung dari TDEE dikurangi defisit, bisa di-override manual',
      },
      {
        field: 'is_active',
        type: 'boolean',
        defaultValue: true,
        note: 'Hanya satu goal aktif per user',
      },
      createdAt(),
      updatedAt(),
    ],
  },

  // ----------------------------------------------------------
  // DAILY LOGS
  // ----------------------------------------------------------
  {
    collection: 'weight_logs',
    typeName: 'WeightLogRecord',
    icon: 'monitor_weight',
    note: 'Berat badan harian. Satu baris per user per hari.',
    fields: [
      pk(),
      userFk('weight_logs'),
      decimalField('weight_kg', 5, 2),
      loggedAtDate(),
      userDateKey(),
      notes(),
      createdAt(),
    ],
  },

  {
    collection: 'body_photos',
    typeName: 'BodyPhotoRecord',
    icon: 'photo_camera',
    note: 'Foto badan tampak depan dan samping. Satu baris per user per hari.',
    fields: [
      pk(),
      userFk('body_photos'),
      { field: 'front_photo_url', type: 'string', maxLength: 500 },
      { field: 'side_photo_url', type: 'string', maxLength: 500 },
      fileFk('front_directus_file_id', 'File foto tampak depan di Directus storage'),
      fileFk('side_directus_file_id', 'File foto tampak samping di Directus storage'),
      {
        field: 'ai_analysis',
        type: 'json',
        nullable: true,
        note: 'Raw JSON hasil analisa Groq Vision, disimpan utuh',
      },
      loggedAtDate(),
      userDateKey(),
      createdAt(),
    ],
  },

  {
    collection: 'food_logs',
    typeName: 'FoodLogRecord',
    icon: 'restaurant',
    note: 'Log makanan hasil analisa foto oleh Groq Vision. Bisa banyak per hari.',
    fields: [
      pk(),
      userFk('food_logs'),
      { field: 'photo_url', type: 'string', maxLength: 500 },
      fileFk('directus_file_id', 'File foto makanan di Directus storage'),
      enumField('meal_type', MEAL_TYPE),
      {
        field: 'ai_analysis',
        type: 'json',
        note: 'Raw JSON hasil analisa Groq Vision, disimpan utuh',
      },
      {
        field: 'total_calories',
        type: 'integer',
        note: 'Di-extract dari ai_analysis, jadi kolom sendiri supaya gampang di-aggregate',
      },
      decimalField('protein_g', 6, 2),
      decimalField('carbs_g', 6, 2),
      decimalField('fat_g', 6, 2),
      notes(),
      {
        field: 'logged_at',
        type: 'timestamp',
        note: 'Pakai timestamp, bukan date, supaya urutan makan dalam sehari bisa di-sort',
      },
      createdAt(),
    ],
  },

  {
    collection: 'workout_logs',
    typeName: 'WorkoutLogRecord',
    icon: 'fitness_center',
    note: 'Log olahraga. Bisa banyak per hari. Sumbernya bisa dari library, custom workout, atau input manual.',
    fields: [
      pk(),
      userFk('workout_logs'),
      {
        field: 'workout_library_id',
        type: 'uuid',
        nullable: true,
        note: 'Terisi kalau olahraga dipilih dari library global',
        relation: {
          relatedCollection: 'workout_library',
          onDelete: 'SET NULL',
          oneField: 'workout_logs',
        },
      },
      {
        field: 'custom_workout_id',
        type: 'uuid',
        nullable: true,
        note: 'Terisi kalau olahraga dipilih dari custom workout milik user',
        relation: {
          relatedCollection: 'custom_workouts',
          onDelete: 'SET NULL',
          oneField: 'workout_logs',
        },
      },
      {
        field: 'workout_name',
        type: 'string',
        maxLength: 255,
        note: 'Selalu diisi sebagai display name, walau kedua FK di atas kosong',
      },
      { field: 'duration_minutes', type: 'integer' },
      {
        field: 'calories_burned',
        type: 'integer',
        note: 'calories_per_minute * durasi * (berat_user / 70)',
      },
      enumField('intensity', WORKOUT_INTENSITY),
      {
        field: 'tracked_by_device',
        type: 'boolean',
        defaultValue: false,
        note: 'true kalau sesi ini SUDAH ikut terhitung di angka device_energy_logs hari itu. Dipakai supaya kalorinya tidak dihitung dua kali.',
      },
      notes(),
      loggedAtDate(),
      createdAt(),
    ],
  },

  {
    collection: 'step_logs',
    typeName: 'StepLogRecord',
    icon: 'directions_walk',
    note: 'Langkah kaki harian dari pedometer. Satu baris per user per hari.',
    fields: [
      pk(),
      userFk('step_logs'),
      { field: 'steps', type: 'integer' },
      decimalField('distance_km', 6, 3, { note: 'Estimasi: steps * 0.0008' }),
      {
        field: 'calories_burned',
        type: 'integer',
        note: 'Estimasi: steps * berat_kg * 0.0005',
      },
      loggedAtDate(),
      userDateKey(),
      createdAt(),
    ],
  },

  {
    collection: 'device_energy_logs',
    typeName: 'DeviceEnergyLogRecord',
    icon: 'watch',
    note: 'Kalori keluar seharian menurut smartwatch user. Satu baris per user per hari. Angka ini MENGGANTIKAN hitungan TDEE hari itu, bukan ditambahkan ke atasnya.',
    fields: [
      pk(),
      userFk('device_energy_logs'),
      {
        field: 'total_kcal',
        type: 'integer',
        note: 'Kalori TOTAL sehari, sudah termasuk metabolisme istirahat. Inilah yang dipakai summary. Kalau user memasukkan kalori aktif, kolom ini HASIL TURUNAN dari active_kcal + bmr_kcal.',
      },
      {
        field: 'active_kcal',
        type: 'integer',
        nullable: true,
        note: 'Kalori AKTIF apa adanya dari perangkat, tanpa metabolisme istirahat. Terisi hanya kalau itu yang dimasukkan user. Null berarti user memasukkan angka total langsung.',
      },
      {
        field: 'bmr_kcal',
        type: 'integer',
        nullable: true,
        note: 'BMR yang ditambahkan ke active_kcal untuk memperoleh total_kcal. Disimpan supaya angka turunannya bisa ditelusuri kembali, bukan dipercaya begitu saja.',
      },
      {
        field: 'source',
        type: 'string',
        maxLength: 64,
        nullable: true,
        note: 'Nama perangkatnya, misalnya "Galaxy Watch". Sekadar keterangan.',
      },
      notes(),
      loggedAtDate(),
      userDateKey(),
      createdAt(),
    ],
  },

  {
    collection: 'sleep_logs',
    typeName: 'SleepLogRecord',
    icon: 'bedtime',
    note: 'Log tidur. Sengaja TIDAK unik per hari karena user bisa tidur siang juga.',
    fields: [
      pk(),
      userFk('sleep_logs'),
      { field: 'sleep_start', type: 'timestamp' },
      { field: 'sleep_end', type: 'timestamp' },
      {
        field: 'duration_minutes',
        type: 'integer',
        note: 'Dihitung backend dari sleep_end - sleep_start',
      },
      {
        field: 'quality_score',
        type: 'integer',
        note: '1 = sangat buruk sampai 5 = sangat baik. Divalidasi Zod.',
      },
      notes(),
      loggedAtDate(),
      createdAt(),
    ],
  },

  {
    collection: 'water_logs',
    typeName: 'WaterLogRecord',
    icon: 'water_drop',
    note: 'Log minum air. Berkali-kali per hari, di-aggregate SUM saat summary.',
    fields: [
      pk(),
      userFk('water_logs'),
      { field: 'amount_ml', type: 'integer' },
      {
        field: 'logged_at',
        type: 'timestamp',
        note: 'Pakai timestamp supaya ada jam per tegukan',
      },
      createdAt(),
    ],
  },

  {
    collection: 'body_measurements',
    typeName: 'BodyMeasurementRecord',
    icon: 'straighten',
    note: 'Ukuran lingkar badan. Semua kolom nullable karena user boleh isi sebagian saja.',
    fields: [
      pk(),
      userFk('body_measurements'),
      decimalField('waist_cm', 5, 2, { nullable: true }),
      decimalField('hips_cm', 5, 2, { nullable: true }),
      decimalField('chest_cm', 5, 2, { nullable: true }),
      decimalField('left_arm_cm', 5, 2, { nullable: true }),
      decimalField('right_arm_cm', 5, 2, { nullable: true }),
      decimalField('left_thigh_cm', 5, 2, { nullable: true }),
      decimalField('right_thigh_cm', 5, 2, { nullable: true }),
      loggedAtDate(),
      userDateKey(),
      createdAt(),
    ],
  },

  {
    collection: 'mood_logs',
    typeName: 'MoodLogRecord',
    icon: 'mood',
    note: 'Mood dan energi harian. Satu baris per user per hari.',
    fields: [
      pk(),
      userFk('mood_logs'),
      {
        field: 'mood_score',
        type: 'integer',
        note: '1 = sangat buruk sampai 5 = sangat baik. Divalidasi Zod.',
      },
      {
        field: 'energy_score',
        type: 'integer',
        note: '1 = sangat lelah sampai 5 = sangat berenergi. Divalidasi Zod.',
      },
      notes(),
      loggedAtDate(),
      userDateKey(),
      createdAt(),
    ],
  },

  // ----------------------------------------------------------
  // STREAK & NOTIFICATIONS
  // ----------------------------------------------------------
  {
    collection: 'chat_messages',
    typeName: 'ChatMessageRecord',
    icon: 'chat',
    note: 'Riwayat percakapan dengan asisten AI. Satu percakapan berjalan per user, diurutkan menurut created_at.',
    fields: [
      pk(),
      userFk('chat_messages'),
      enumField('role', CHAT_ROLE, {
        note: 'USER kalau ditulis user, ASSISTANT kalau balasan model',
      }),
      {
        field: 'content',
        type: 'text',
        note: 'Isi pesan apa adanya. Balasan model sudah dibersihkan tanda pisahnya sebelum disimpan.',
      },
      createdAt(),
    ],
  },

  {
    collection: 'streaks',
    typeName: 'StreakRecord',
    icon: 'local_fire_department',
    note: 'Rekap streak per user. Satu baris per user, dibuat otomatis saat register.',
    fields: [
      pk(),
      userFk('streak', { unique: true }),
      { field: 'current_streak', type: 'integer', defaultValue: 0 },
      { field: 'longest_streak', type: 'integer', defaultValue: 0 },
      {
        field: 'last_logged_date',
        type: 'date',
        nullable: true,
        note: 'Untuk cek apakah hari ini sudah dihitung',
      },
      updatedAt(),
    ],
  },

  {
    collection: 'notification_settings',
    typeName: 'NotificationSettingsRecord',
    icon: 'notifications',
    note: 'Pengaturan reminder per user. Satu baris per user, dibuat otomatis saat register.',
    fields: [
      pk(),
      userFk('notification_settings', { unique: true }),
      {
        field: 'expo_push_token',
        type: 'string',
        maxLength: 255,
        nullable: true,
        note: 'Diisi client setelah user memberi izin notifikasi',
      },
      { field: 'weight_reminder_enabled', type: 'boolean', defaultValue: true },
      {
        field: 'weight_reminder_time',
        type: 'string',
        maxLength: 5,
        defaultValue: '21:00',
        note: 'Format HH:mm, timezone WIB',
      },
      { field: 'water_reminder_enabled', type: 'boolean', defaultValue: true },
      {
        field: 'water_reminder_interval_hours',
        type: 'integer',
        defaultValue: 2,
        note: 'Reminder minum air setiap N jam',
      },
      { field: 'workout_reminder_enabled', type: 'boolean', defaultValue: true },
      {
        field: 'workout_reminder_time',
        type: 'string',
        maxLength: 5,
        defaultValue: '07:00',
        note: 'Format HH:mm, timezone WIB',
      },
      { field: 'photo_reminder_enabled', type: 'boolean', defaultValue: true },
      {
        field: 'photo_reminder_time',
        type: 'string',
        maxLength: 5,
        defaultValue: '08:00',
        note: 'Format HH:mm, timezone WIB',
      },
      createdAt(),
      updatedAt(),
    ],
  },

  // ----------------------------------------------------------
  // WORKOUT LIBRARY
  // ----------------------------------------------------------
  {
    collection: 'workout_library',
    typeName: 'WorkoutLibraryRecord',
    icon: 'menu_book',
    note: 'Library olahraga global untuk semua user. Di-seed lewat npm run seed.',
    fields: [
      pk(),
      { field: 'name', type: 'string', maxLength: 255 },
      enumField('category', WORKOUT_CATEGORY),
      decimalField('met', 4, 1, {
        // Nullable karena baris yang sudah ada sebelum kolom ini memang belum
        // punya nilai MET. Mengisinya dengan angka bawaan akan mengarang data
        // yang terlihat resmi, biarkan kosong sampai npm run seed mengisinya.
        nullable: true,
        note:
          'Nilai MET dari Compendium of Physical Activities (Ainsworth dkk. 2011). ' +
          'Ini DATA SUMBERNYA, calories_burned_per_minute cuma turunannya.',
      }),
      decimalField('calories_burned_per_minute', 5, 2, {
        note:
          'Kalori BERSIH per menit untuk berat 70kg, diturunkan dari met lewat ' +
          '(MET-1) x 3.5 x 70 / 200. Bersih artinya sudah dikurangi metabolisme ' +
          'istirahat, yang sudah ditanggung TDEE. Backend men-scale sesuai berat user.',
      }),
      { field: 'description', type: 'text', nullable: true },
      createdAt(),
    ],
  },

  {
    collection: 'custom_workouts',
    typeName: 'CustomWorkoutRecord',
    icon: 'add_circle',
    note: 'Library olahraga custom milik masing-masing user.',
    fields: [
      pk(),
      userFk('custom_workouts'),
      { field: 'name', type: 'string', maxLength: 255 },
      enumField('category', WORKOUT_CATEGORY),
      decimalField('calories_burned_per_minute', 5, 2, {
        note:
          'Kalori BERSIH per menit untuk berat 70kg, di atas metabolisme istirahat. ' +
          'Skala yang sama dengan workout_library supaya kedua sumber bisa dibandingkan.',
      }),
      { field: 'description', type: 'text', nullable: true },
      createdAt(),
    ],
  },
];

/**
 * Urutan pembuatan collection penting karena relasi merujuk collection lain.
 * Script apply-schema membuat semua collection dulu, baru field, baru relasi,
 * jadi urutan di array ini hanya memengaruhi urutan tampilan di admin panel.
 */
export const collectionNames = collections.map((c) => c.collection);
