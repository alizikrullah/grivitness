import { config } from 'dotenv';
import { z } from 'zod';

config();

/**
 * Semua environment variable divalidasi di satu tempat dan di-parse saat modul ini
 * pertama kali di-import. Kalau ada yang kurang atau salah format, proses langsung
 * berhenti dengan pesan jelas — bukan meledak di tengah request nanti.
 */
const EnvSchema = z.object({
  // --- Server ---
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // --- Directus ---
  DIRECTUS_URL: z.url({ message: 'DIRECTUS_URL harus berupa URL yang valid' }),
  DIRECTUS_ADMIN_TOKEN: z
    .string()
    .min(1, 'DIRECTUS_ADMIN_TOKEN wajib diisi. Ambil di Directus > User Directory > user admin > field Token'),
  DIRECTUS_SYNC_USERS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // --- JWT ---
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET minimal 32 karakter'),
  ACCESS_TOKEN_EXPIRY: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

  // --- Groq ---
  // Sengaja tidak wajib: baru dibutuhkan saat module food & body-photos dikerjakan.
  GROQ_API_KEY: z.string().default(''),
  GROQ_VISION_MODEL: z.string().default('qwen/qwen3.6-27b'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  // Sengaja pakai process.stderr, bukan logger — logger sendiri butuh env,
  // jadi belum tentu tersedia saat kegagalan ini terjadi.
  process.stderr.write(`\nKonfigurasi environment tidak valid:\n${details}\n\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
