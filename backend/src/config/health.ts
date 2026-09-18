import { createRequire } from 'node:module';

import { serverHealth } from '@directus/sdk';

import { directus } from './directus.js';

/**
 * Versi dari package.json, dibaca sekali saat modul dimuat.
 *
 * Dipakai untuk memastikan deploy otomatis benar-benar mendarat: setelah push,
 * /health di produksi harus menampilkan versi baru. Tanpa ini tidak ada cara
 * membedakan backend lama yang masih hidup dari backend baru yang gagal naik,
 * keduanya sama-sama membalas "ok".
 *
 * Jalur relatifnya sama di src/ maupun dist/, dua tingkat di bawah akar paket,
 * jadi berlaku untuk tsx saat development dan node dist/ di Docker.
 */
const { version } = createRequire(import.meta.url)('../../package.json') as { version: string };

/**
 * Health check yang benar-benar memverifikasi dependensi, bukan sekadar
 * membalas "ok" karena proses Node-nya hidup.
 *
 * Ini penting justru karena Directus adalah titik kegagalan tunggal: seluruh
 * data aplikasi lewat dia. Backend yang hidup tapi tidak bisa menghubungi
 * Directus sama sekali tidak berguna, dan Coolify perlu tahu itu supaya tidak
 * mengarahkan trafik ke instance yang sebenarnya tidak sanggup melayani.
 */

export interface HealthReport {
  status: 'ok' | 'degraded';
  version: string;
  uptime_seconds: number;
  environment: string;
  dependencies: {
    directus: {
      reachable: boolean;
      latency_ms: number | null;
      error?: string;
    };
  };
}

/** Batas tunggu sengaja pendek, health check tidak boleh ikut menggantung. */
const PROBE_TIMEOUT_MS = 3000;

const probeDirectus = async (): Promise<HealthReport['dependencies']['directus']> => {
  const started = Date.now();

  try {
    await Promise.race([
      directus.request(serverHealth()),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS);
      }),
    ]);

    return { reachable: true, latency_ms: Date.now() - started };
  } catch (error) {
    return {
      reachable: false,
      latency_ms: null,
      error: error instanceof Error ? error.message : 'tidak diketahui',
    };
  }
};

export const checkHealth = async (environment: string): Promise<HealthReport> => {
  const directusStatus = await probeDirectus();

  return {
    status: directusStatus.reachable ? 'ok' : 'degraded',
    version,
    uptime_seconds: Math.round(process.uptime()),
    environment,
    dependencies: { directus: directusStatus },
  };
};
