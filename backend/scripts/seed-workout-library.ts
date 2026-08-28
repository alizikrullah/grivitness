/**
 * Mengisi dan MENYELARASKAN workout_library dengan jenis olahraga umum.
 *
 * Jalankan: npm run seed
 *
 * Idempotent, dan sejak versi ini juga MEMPERBARUI entri yang nilainya berubah.
 * Sebelumnya olahraga yang namanya sudah ada langsung dilewati, jadi koreksi
 * nilai tidak pernah sampai ke database yang sudah terisi, nilai yang salah
 * akan hidup selamanya di sana.
 *
 * ---
 *
 * NILAI MET adalah data sumbernya, diambil dari:
 *   Ainsworth BE dkk. "2011 Compendium of Physical Activities: a second update
 *   of codes and MET values." Med Sci Sports Exerc 2011;43(8):1575-1581.
 *
 * Kolom calories_burned_per_minute cuma TURUNAN, dihitung sekali di sini lewat
 * netKcalPerMinuteAt70(). Ini bukan kerapian belaka: sebelumnya nilai MET
 * disalin mentah ke kolom kkal/menit tanpa pernah dikonversi, dan karena yang
 * tersimpan hanya hasil akhirnya, tidak ada satu tempat pun yang bisa
 * memperlihatkan bahwa konversinya tidak pernah dijalankan.
 *
 * Nilainya BERSIH, sudah dikurangi satu MET metabolisme istirahat, karena
 * energi itu sudah ditanggung TDEE. Menghitungnya kotor berarti membayar jam
 * yang sama dua kali dan membuat defisit user terlihat lebih besar dari
 * kenyataan.
 */

import {
  createItems,
  createDirectus,
  readItems,
  rest,
  staticToken,
  updateItem,
} from '@directus/sdk';

import type { WorkoutCategory } from '../src/constants/enums.js';
import { env } from '../src/config/env.js';
import { netKcalPerMinuteAt70 } from '../src/utils/calories.js';

const client = createDirectus(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_ADMIN_TOKEN))
  .with(rest());

interface SeedItem {
  name: string;
  category: WorkoutCategory;
  /** Nilai MET dari Compendium 2011. */
  met: number;
  description: string;
  /**
   * Diisi kalau nilainya TIDAK ada di Compendium dan merupakan perkiraan.
   * Ditandai supaya tidak sengaja dianggap punya rujukan yang sama kuatnya.
   */
  estimated?: true;
}

const LIBRARY: SeedItem[] = [
  // --- CARDIO ---
  {
    name: 'Jalan Santai',
    category: 'CARDIO',
    met: 3.0,
    description: 'Sekitar 4 km/jam, tempo mengobrol',
  },
  { name: 'Jalan Cepat', category: 'CARDIO', met: 5.0, description: 'Sekitar 6,4 km/jam' },
  { name: 'Lari Santai', category: 'CARDIO', met: 8.3, description: 'Sekitar 8 km/jam' },
  { name: 'Lari Cepat', category: 'CARDIO', met: 11.5, description: 'Sekitar 12 km/jam' },
  {
    name: 'Bersepeda Santai',
    category: 'CARDIO',
    met: 6.8,
    description: 'Sekitar 16-19 km/jam di jalan datar',
  },
  { name: 'Bersepeda Cepat', category: 'CARDIO', met: 8.0, description: 'Sekitar 19-22 km/jam' },
  { name: 'Renang', category: 'CARDIO', met: 5.8, description: 'Gaya bebas tempo sedang' },
  { name: 'Lompat Tali', category: 'CARDIO', met: 12.3, description: 'Tempo sedang' },
  {
    name: 'Naik Tangga',
    category: 'CARDIO',
    met: 9.0,
    description: 'Naik turun tangga terus-menerus',
  },
  {
    name: 'HIIT',
    category: 'CARDIO',
    met: 8.0,
    description: 'Interval intensitas tinggi, rata-rata satu sesi termasuk jeda',
    estimated: true,
  },
  { name: 'Zumba', category: 'CARDIO', met: 7.3, description: 'Senam aerobik berbasis tarian' },
  { name: 'Mendaki', category: 'CARDIO', met: 6.0, description: 'Lintas alam, medan menanjak' },

  // --- STRENGTH ---
  {
    name: 'Angkat Beban Ringan',
    category: 'STRENGTH',
    met: 3.5,
    description: 'Beban ringan, 8-15 repetisi',
  },
  {
    name: 'Angkat Beban Berat',
    category: 'STRENGTH',
    met: 6.0,
    description: 'Beban berat, repetisi sedikit',
  },
  {
    name: 'Push Up',
    category: 'STRENGTH',
    met: 8.0,
    description: 'Latihan dada dan trisep, tempo cepat',
  },
  {
    name: 'Pull Up',
    category: 'STRENGTH',
    met: 8.0,
    description: 'Latihan punggung dan bisep, tempo cepat',
  },
  { name: 'Squat', category: 'STRENGTH', met: 5.0, description: 'Latihan paha dan bokong' },
  {
    name: 'Deadlift',
    category: 'STRENGTH',
    met: 6.0,
    description: 'Latihan punggung bawah dan kaki',
  },
  {
    name: 'Plank',
    category: 'STRENGTH',
    met: 3.8,
    description: 'Latihan inti tubuh statis',
    estimated: true,
  },
  { name: 'Sit Up', category: 'STRENGTH', met: 3.8, description: 'Latihan perut, tempo sedang' },
  { name: 'Lunges', category: 'STRENGTH', met: 3.8, description: 'Latihan kaki satu per satu' },
  {
    name: 'Latihan Beban Sirkuit',
    category: 'STRENGTH',
    met: 8.0,
    description: 'Berpindah antar alat tanpa jeda panjang',
  },

  // --- FLEXIBILITY ---
  {
    name: 'Yoga',
    category: 'FLEXIBILITY',
    met: 2.5,
    description: 'Hatha, tempo pelan sampai sedang',
  },
  { name: 'Pilates', category: 'FLEXIBILITY', met: 3.0, description: 'Fokus pada inti tubuh' },
  { name: 'Peregangan', category: 'FLEXIBILITY', met: 2.3, description: 'Peregangan statis' },
  { name: 'Tai Chi', category: 'FLEXIBILITY', met: 3.0, description: 'Gerakan lambat terkendali' },

  // --- SPORTS ---
  { name: 'Sepak Bola', category: 'SPORTS', met: 7.0, description: 'Permainan rekreasi' },
  {
    name: 'Futsal',
    category: 'SPORTS',
    met: 10.0,
    description: 'Lapangan kecil, tempo cepat terus-menerus',
    estimated: true,
  },
  { name: 'Basket', category: 'SPORTS', met: 8.0, description: 'Permainan penuh' },
  {
    name: 'Bulu Tangkis',
    category: 'SPORTS',
    met: 5.5,
    description: 'Permainan rekreasi, tunggal maupun ganda',
  },
  { name: 'Tenis Meja', category: 'SPORTS', met: 4.0, description: 'Permainan rekreasi' },
  { name: 'Voli', category: 'SPORTS', met: 4.0, description: 'Permainan rekreasi' },
  { name: 'Tenis', category: 'SPORTS', met: 8.0, description: 'Permainan tunggal' },
  {
    name: 'Panjat Tebing',
    category: 'SPORTS',
    met: 5.8,
    description: 'Dinding panjat dalam ruangan, kesulitan sedang',
  },
  {
    name: 'Bela Diri',
    category: 'SPORTS',
    met: 10.3,
    description: 'Karate, taekwondo, judo, atau sejenisnya',
  },

  // --- OTHER ---
  {
    name: 'Berkebun',
    category: 'OTHER',
    met: 3.8,
    description: 'Aktivitas fisik ringan sampai sedang',
  },
  {
    name: 'Bersih-bersih Rumah',
    category: 'OTHER',
    met: 3.3,
    description: 'Menyapu, mengepel, merapikan',
  },
  { name: 'Menari', category: 'OTHER', met: 5.5, description: 'Tempo sedang' },
];

/** Bentuk yang benar-benar disimpan. MET jadi sumber, kkal/menit jadi turunannya. */
const toRow = (item: SeedItem) => ({
  name: item.name,
  category: item.category,
  met: item.met.toFixed(1),
  calories_burned_per_minute: netKcalPerMinuteAt70(item.met).toFixed(2),
  description: item.description,
});

const write = (line: string) => process.stdout.write(`${line}\n`);

const hijau = (s: string) => `\x1b[32m${s}\x1b[0m`;
const kuning = (s: string) => `\x1b[33m${s}\x1b[0m`;

interface ExistingRow {
  id: string;
  name: string;
  met: string | null;
  calories_burned_per_minute: string;
}

const main = async (): Promise<void> => {
  write(`\nTarget Directus : ${env.DIRECTUS_URL}`);
  write(`Kandidat seed   : ${LIBRARY.length} olahraga\n`);

  const existing = (await client.request(
    readItems('workout_library', {
      fields: ['id', 'name', 'met', 'calories_burned_per_minute'],
      limit: -1,
    }),
  )) as ExistingRow[];

  const byName = new Map(existing.map((row) => [row.name, row]));

  const baru = LIBRARY.filter((item) => !byName.has(item.name));

  // Entri yang sudah ada tapi nilainya berbeda dari daftar di atas. Inilah yang
  // membuat koreksi benar-benar sampai ke database yang sudah terisi.
  const berubah = LIBRARY.flatMap((item) => {
    const row = byName.get(item.name);
    if (!row) return [];

    const target = toRow(item);
    const sama =
      row.met === target.met &&
      row.calories_burned_per_minute === target.calories_burned_per_minute;

    return sama ? [] : [{ id: row.id, item, target, lama: row }];
  });

  if (baru.length === 0 && berubah.length === 0) {
    write('Library sudah selaras dengan daftar di script. Tidak ada perubahan.\n');
    return;
  }

  if (baru.length > 0) {
    // Dikirim sekali sebagai satu batch, bukan satu per satu. Empat puluh request
    // berurutan ke Directus jauh lebih lambat tanpa manfaat apa pun.
    await client.request(createItems('workout_library', baru.map(toRow)));

    for (const item of baru) {
      write(
        `  ${hijau('+')} ${item.name}, MET ${item.met}, ` +
          `${netKcalPerMinuteAt70(item.met)} kkal/menit @70kg`,
      );
    }
  }

  for (const { id, item, target, lama } of berubah) {
    await client.request(
      updateItem('workout_library', id, {
        met: target.met,
        calories_burned_per_minute: target.calories_burned_per_minute,
        category: target.category,
        description: target.description,
      }),
    );

    write(
      `  ${kuning('~')} ${item.name}, ${lama.calories_burned_per_minute} → ` +
        `${target.calories_burned_per_minute} kkal/menit (MET ${target.met})`,
    );
  }

  const perkiraan = LIBRARY.filter((i) => i.estimated).map((i) => i.name);

  write(`\nDitambahkan ${baru.length}, diperbarui ${berubah.length}.`);
  write(`Nilai perkiraan (tidak ada di Compendium): ${perkiraan.join(', ')}.\n`);
};

main().catch((error: unknown) => {
  const pesan =
    typeof error === 'object' && error !== null && 'errors' in error
      ? JSON.stringify(error.errors)
      : String(error);

  process.stderr.write(`\nSeed gagal: ${pesan}\n\n`);
  process.exit(1);
});
