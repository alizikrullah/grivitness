import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Alias yang sama dengan mobile, supaya kode yang diporting antar keduanya
    // tidak perlu ditulis ulang jalur impornya.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // Dibuka ke jaringan supaya bisa dibuka dari perangkat lain di jaringan
    // yang sama, sama seperti dev server Expo.
    host: true,
  },
});
