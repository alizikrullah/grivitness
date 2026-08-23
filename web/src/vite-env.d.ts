/// <reference types="vite/client" />

/**
 * Mengetikkan variabel lingkungan yang dipakai aplikasi ini.
 *
 * Tanpa deklarasi ini `import.meta.env.VITE_API_URL` bertipe `any`, dan seluruh
 * nilai yang mengalir darinya ikut kehilangan tipe tanpa satu peringatan pun —
 * termasuk baseURL axios yang jadi dasar setiap permintaan.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
