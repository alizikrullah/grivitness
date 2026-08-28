import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // NODE_ENV=test mematikan rate limit (lihat auth.routes.ts) dan membungkam
    // logger, supaya keluaran test bersih dan tidak tertahan pembatasan.
    env: { NODE_ENV: 'test' },

    // Test integrasi menembak Directus sungguhan lewat internet, jadi butuh
    // waktu jauh lebih longgar daripada test unit biasa.
    testTimeout: 30_000,
    hookTimeout: 60_000,

    // Berkas test dijalankan berurutan, tidak paralel. Test integrasi berbagi
    // satu instance Directus yang sama, kalau jalan bersamaan, data uji milik
    // satu berkas bisa terbaca atau terhapus oleh berkas lain.
    fileParallelism: false,
  },
});
