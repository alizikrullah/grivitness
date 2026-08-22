/**
 * Mengisi workout_library dengan jenis olahraga umum.
 *
 * Jalankan: npm run seed
 *
 * Idempotent — olahraga yang namanya sudah ada dilewati, jadi aman dijalankan
 * ulang setelah menambah entri baru di daftar bawah.
 *
 * Nilai calories_burned_per_minute adalah estimasi untuk berat badan 70kg,
 * diturunkan dari nilai MET yang umum dipakai (kkal/menit = MET * 3.5 * berat
 * / 200). Angkanya perkiraan populasi, bukan pengukuran per individu — backend
 * men-scale-nya sesuai berat badan user saat mencatat log.
 */

import { createItems, createDirectus, readItems, rest, staticToken } from '@directus/sdk';

import type { WorkoutCategory } from '../src/constants/enums.js';
import { env } from '../src/config/env.js';

const client = createDirectus(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_ADMIN_TOKEN))
  .with(rest());

interface SeedItem {
  name: string;
  category: WorkoutCategory;
  /** kkal per menit untuk berat 70kg */
  kcalPerMinute: number;
  description: string;
}

const LIBRARY: SeedItem[] = [
  // --- CARDIO ---
  { name: 'Jalan Santai', category: 'CARDIO', kcalPerMinute: 3.5, description: 'Sekitar 4 km/jam, tempo mengobrol' },
  { name: 'Jalan Cepat', category: 'CARDIO', kcalPerMinute: 5.0, description: 'Sekitar 6 km/jam' },
  { name: 'Lari Santai', category: 'CARDIO', kcalPerMinute: 8.2, description: 'Sekitar 8 km/jam' },
  { name: 'Lari Cepat', category: 'CARDIO', kcalPerMinute: 13.5, description: 'Sekitar 12 km/jam' },
  { name: 'Bersepeda Santai', category: 'CARDIO', kcalPerMinute: 5.8, description: 'Sekitar 16 km/jam di jalan datar' },
  { name: 'Bersepeda Cepat', category: 'CARDIO', kcalPerMinute: 10.5, description: 'Di atas 20 km/jam' },
  { name: 'Renang', category: 'CARDIO', kcalPerMinute: 8.2, description: 'Gaya bebas tempo sedang' },
  { name: 'Lompat Tali', category: 'CARDIO', kcalPerMinute: 11.7, description: 'Tempo sedang' },
  { name: 'Naik Tangga', category: 'CARDIO', kcalPerMinute: 9.3, description: 'Naik turun tangga terus-menerus' },
  { name: 'HIIT', category: 'CARDIO', kcalPerMinute: 12.3, description: 'Interval intensitas tinggi' },
  { name: 'Zumba', category: 'CARDIO', kcalPerMinute: 7.0, description: 'Senam aerobik berbasis tarian' },
  { name: 'Mendaki', category: 'CARDIO', kcalPerMinute: 7.0, description: 'Medan menanjak' },

  // --- STRENGTH ---
  { name: 'Angkat Beban Ringan', category: 'STRENGTH', kcalPerMinute: 3.5, description: 'Beban ringan, repetisi banyak' },
  { name: 'Angkat Beban Berat', category: 'STRENGTH', kcalPerMinute: 7.0, description: 'Beban berat, repetisi sedikit' },
  { name: 'Push Up', category: 'STRENGTH', kcalPerMinute: 8.0, description: 'Latihan dada dan trisep' },
  { name: 'Pull Up', category: 'STRENGTH', kcalPerMinute: 9.3, description: 'Latihan punggung dan bisep' },
  { name: 'Squat', category: 'STRENGTH', kcalPerMinute: 6.4, description: 'Latihan paha dan bokong' },
  { name: 'Deadlift', category: 'STRENGTH', kcalPerMinute: 7.0, description: 'Latihan punggung bawah dan kaki' },
  { name: 'Plank', category: 'STRENGTH', kcalPerMinute: 4.1, description: 'Latihan inti tubuh statis' },
  { name: 'Sit Up', category: 'STRENGTH', kcalPerMinute: 5.3, description: 'Latihan perut' },
  { name: 'Lunges', category: 'STRENGTH', kcalPerMinute: 5.8, description: 'Latihan kaki satu per satu' },
  { name: 'Latihan Beban Sirkuit', category: 'STRENGTH', kcalPerMinute: 9.3, description: 'Berpindah antar alat tanpa jeda panjang' },

  // --- FLEXIBILITY ---
  { name: 'Yoga', category: 'FLEXIBILITY', kcalPerMinute: 2.9, description: 'Tempo pelan sampai sedang' },
  { name: 'Pilates', category: 'FLEXIBILITY', kcalPerMinute: 4.1, description: 'Fokus pada inti tubuh' },
  { name: 'Peregangan', category: 'FLEXIBILITY', kcalPerMinute: 2.3, description: 'Peregangan statis' },
  { name: 'Tai Chi', category: 'FLEXIBILITY', kcalPerMinute: 4.1, description: 'Gerakan lambat terkendali' },

  // --- SPORTS ---
  { name: 'Sepak Bola', category: 'SPORTS', kcalPerMinute: 8.2, description: 'Permainan rekreasi' },
  { name: 'Futsal', category: 'SPORTS', kcalPerMinute: 9.3, description: 'Lapangan kecil, tempo cepat' },
  { name: 'Basket', category: 'SPORTS', kcalPerMinute: 8.2, description: 'Permainan penuh' },
  { name: 'Bulu Tangkis', category: 'SPORTS', kcalPerMinute: 6.4, description: 'Permainan rekreasi' },
  { name: 'Tenis Meja', category: 'SPORTS', kcalPerMinute: 4.7, description: 'Permainan rekreasi' },
  { name: 'Voli', category: 'SPORTS', kcalPerMinute: 4.7, description: 'Permainan rekreasi' },
  { name: 'Tenis', category: 'SPORTS', kcalPerMinute: 8.2, description: 'Permainan tunggal' },
  { name: 'Panjat Tebing', category: 'SPORTS', kcalPerMinute: 9.3, description: 'Dinding panjat dalam ruangan' },
  { name: 'Bela Diri', category: 'SPORTS', kcalPerMinute: 11.7, description: 'Karate, taekwondo, atau sejenisnya' },

  // --- OTHER ---
  { name: 'Berkebun', category: 'OTHER', kcalPerMinute: 4.1, description: 'Aktivitas fisik ringan' },
  { name: 'Bersih-bersih Rumah', category: 'OTHER', kcalPerMinute: 3.5, description: 'Menyapu, mengepel, merapikan' },
  { name: 'Menari', category: 'OTHER', kcalPerMinute: 5.8, description: 'Tempo sedang' },
];

const write = (line: string) => process.stdout.write(`${line}\n`);

const main = async (): Promise<void> => {
  write(`\nTarget Directus : ${env.DIRECTUS_URL}`);
  write(`Kandidat seed   : ${LIBRARY.length} olahraga\n`);

  const existing = await client.request(
    readItems('workout_library', { fields: ['name'], limit: -1 }),
  );

  const sudahAda = new Set((existing as { name: string }[]).map((item) => item.name));

  const baru = LIBRARY.filter((item) => !sudahAda.has(item.name));

  if (baru.length === 0) {
    write('Semua olahraga sudah ada di library, tidak ada yang ditambahkan.\n');
    return;
  }

  // Dikirim sekali sebagai satu batch, bukan satu per satu. Empat puluh request
  // berurutan ke Directus jauh lebih lambat tanpa manfaat apa pun.
  await client.request(
    createItems(
      'workout_library',
      baru.map((item) => ({
        name: item.name,
        category: item.category,
        calories_burned_per_minute: item.kcalPerMinute.toFixed(2),
        description: item.description,
      })),
    ),
  );

  for (const item of baru) {
    write(`  \x1b[32m+\x1b[0m ${item.name} (${item.category}, ${item.kcalPerMinute} kkal/menit)`);
  }

  write(`\nDitambahkan ${baru.length} olahraga. Dilewati ${LIBRARY.length - baru.length}.\n`);
};

main().catch((error: unknown) => {
  const pesan =
    typeof error === 'object' && error !== null && 'errors' in error
      ? JSON.stringify(error.errors)
      : String(error);

  process.stderr.write(`\nSeed gagal: ${pesan}\n\n`);
  process.exit(1);
});
