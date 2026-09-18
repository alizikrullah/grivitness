/**
 * Migrasi satu kali untuk tinjauan pemakaian dua minggu, September 2026.
 *
 * Jalankan: npx tsx scripts/migrate-review-2026-09.ts <siapkan|bersihkan>
 *
 * schema:apply sengaja tidak pernah mengubah atau menghapus apa pun, jadi
 * kolom yang dilonggarkan atau dicabut dari directus/schema.ts harus lewat
 * jalur ini. Skrip ini IDEMPOTEN: yang sudah sesuai dilewati, jadi aman
 * dijalankan ulang kalau terputus di tengah.
 *
 * Dua tahap, karena backend produksi di-deploy otomatis dari git dan ada
 * jeda antara push dan kode baru hidup. Selama jeda itu kode LAMA masih
 * menulis ke kolom yang akan dicabut, jadi mencabutnya lebih dulu mematikan
 * produksi selama beberapa menit.
 *
 *   siapkan     Aman dijalankan SEBELUM deploy. Cuma melonggarkan kolom jadi
 *               nullable, sehingga kode lama (masih menulis) dan kode baru
 *               (tidak menulis lagi) sama-sama jalan.
 *
 *   bersihkan   Dijalankan SESUDAH kode baru hidup di produksi:
 *               1. Kosongkan food_logs beserta berkas fotonya di storage, dan
 *                  body_measurements. Struktur datanya berubah total, dan
 *                  pemiliknya sendiri yang meminta data lama dibuang.
 *               2. Hapus kolom yang tidak dipakai lagi.
 *               3. Isi workout_logs.calories_source = 'MET' untuk baris lama.
 *                  Semua baris lama memang dihitung dari MET, karena angka
 *                  dari client dulu diabaikan.
 *
 * Skrip ini menyentuh SEMUA user, karena perubahan schema memang global. Saat
 * dijalankan, user yang ada cuma pemilik proyek dan beberapa penguji yang
 * tahu datanya akan dibersihkan.
 */

import {
  deleteField,
  deleteFile,
  deleteItems,
  readFieldsByCollection,
  readItems,
  updateField,
  updateItems,
} from '@directus/sdk';

import { directus } from '../src/config/directus.js';

const log = (pesan: string): void => {
  process.stdout.write(`${pesan}\n`);
};

interface KolomHidup {
  field: string;
  schema: { is_nullable?: boolean } | null;
}

const kolomDi = async (collection: string): Promise<KolomHidup[]> =>
  await directus.request(readFieldsByCollection(collection));

// ============================================================
// TAHAP 1: SIAPKAN
// ============================================================

/**
 * Kolom yang tidak lagi ditulis kode baru tapi masih ditulis kode lama.
 * Dilonggarkan jadi nullable supaya keduanya hidup berdampingan sampai deploy.
 */
const KOLOM_DILONGGARKAN: readonly (readonly [string, string])[] = [
  ['step_logs', 'calories_burned'],
  ['food_logs', 'photo_url'],
  ['food_logs', 'ai_analysis'],
  ['food_logs', 'total_calories'],
  ['food_logs', 'protein_g'],
  ['food_logs', 'carbs_g'],
  ['food_logs', 'fat_g'],
];

const siapkan = async (): Promise<void> => {
  log('\nTahap SIAPKAN: kolom dilonggarkan jadi nullable');

  for (const [collection, field] of KOLOM_DILONGGARKAN) {
    const kolom = (await kolomDi(collection)).find((k) => k.field === field);

    if (!kolom) {
      log(`   · ${collection}.${field} tidak ada, dilewati`);
      continue;
    }
    if (kolom.schema?.is_nullable) {
      log(`   · ${collection}.${field} sudah nullable`);
      continue;
    }

    await directus.request(
      updateField(collection, field, {
        schema: { is_nullable: true },
        meta: { required: false },
      }),
    );
    log(`   ✓ ${collection}.${field} sekarang nullable`);
  }
};

// ============================================================
// TAHAP 2: BERSIHKAN
// ============================================================

const kosongkanMakanan = async (): Promise<void> => {
  log('\n1a. food_logs beserta fotonya');

  const baris = await directus.request(
    readItems('food_logs', { fields: ['id', 'directus_file_id'], limit: -1 }),
  );

  if (baris.length === 0) {
    log('   · sudah kosong');
    return;
  }

  // Berkas dihapus dulu, baru barisnya. Kalau terbalik dan skrip terputus,
  // yang tertinggal adalah berkas yatim di storage yang tidak dirujuk siapa
  // pun dan tidak bisa ditemukan lagi dari aplikasi.
  let berkas = 0;

  for (const b of baris) {
    if (!b.directus_file_id) continue;

    try {
      await directus.request(deleteFile(b.directus_file_id));
      berkas += 1;
    } catch {
      // Berkas yang sudah hilang bukan alasan menghentikan migrasi.
      log(`   ! berkas ${b.directus_file_id} tidak bisa dihapus, dilewati`);
    }
  }

  await directus.request(
    deleteItems(
      'food_logs',
      baris.map((b) => b.id),
    ),
  );

  log(`   ✓ ${baris.length} catatan makanan dan ${berkas} berkas dihapus`);
};

const kosongkanUkuran = async (): Promise<void> => {
  log('\n1b. body_measurements');

  const baris = await directus.request(
    readItems('body_measurements', { fields: ['id'], limit: -1 }),
  );

  if (baris.length === 0) {
    log('   · sudah kosong');
    return;
  }

  await directus.request(
    deleteItems(
      'body_measurements',
      baris.map((b) => b.id),
    ),
  );

  log(`   ✓ ${baris.length} catatan ukuran badan dihapus`);
};

const KOLOM_DIHAPUS: readonly (readonly [string, string])[] = [
  ['step_logs', 'calories_burned'],
  ['food_logs', 'notes'],
  ['food_logs', 'photo_url'],
  ['body_measurements', 'hips_cm'],
  ['body_measurements', 'chest_cm'],
  ['body_measurements', 'left_arm_cm'],
  ['body_measurements', 'right_arm_cm'],
  ['body_measurements', 'left_thigh_cm'],
  ['body_measurements', 'right_thigh_cm'],
];

const hapusKolom = async (): Promise<void> => {
  log('\n2. Kolom yang dicabut');

  for (const [collection, field] of KOLOM_DIHAPUS) {
    const ada = (await kolomDi(collection)).some((k) => k.field === field);

    if (!ada) {
      log(`   · ${collection}.${field} sudah tidak ada`);
      continue;
    }

    await directus.request(deleteField(collection, field));
    log(`   ✓ ${collection}.${field} dihapus`);
  }
};

const isiAsalKalori = async (): Promise<void> => {
  log('\n3. workout_logs.calories_source untuk baris lama');

  // Tipe schema menganggap kolomnya tidak pernah null, dan itu benar untuk
  // baris baru. Baris lama dari sebelum kolom ini ada yang justru dicari.
  const kosong = await directus.request(
    readItems('workout_logs', {
      filter: { calories_source: { _null: true } } as never,
      fields: ['id'],
      limit: -1,
    }),
  );

  if (kosong.length === 0) {
    log('   · tidak ada baris yang kosong');
    return;
  }

  await directus.request(
    updateItems(
      'workout_logs',
      kosong.map((b) => b.id),
      { calories_source: 'MET' },
    ),
  );

  log(`   ✓ ${kosong.length} baris ditandai MET`);
};

/**
 * Kolom yang harus WAJIB di kode baru tapi masih nullable di database: yang
 * dilonggarkan di tahap siapkan, dan waist_cm yang dulu memang opsional.
 * Dikencangkan setelah tabelnya kosong, supaya jaminannya kembali ke database
 * dan schema:check tidak melaporkan selisih.
 */
const KOLOM_DIKENCANGKAN: readonly (readonly [string, string])[] = [
  // Pinggang jadi satu-satunya kolom ukuran, dan karena itu wajib.
  ['body_measurements', 'waist_cm'],
  ['food_logs', 'ai_analysis'],
  ['food_logs', 'total_calories'],
  ['food_logs', 'protein_g'],
  ['food_logs', 'carbs_g'],
  ['food_logs', 'fat_g'],
];

const kencangkanKolom = async (): Promise<void> => {
  log('\n4. Kolom food_logs dikembalikan jadi wajib');

  for (const [collection, field] of KOLOM_DIKENCANGKAN) {
    const kolom = (await kolomDi(collection)).find((k) => k.field === field);

    if (!kolom) {
      log(`   · ${collection}.${field} tidak ada, dilewati`);
      continue;
    }
    if (kolom.schema && !kolom.schema.is_nullable) {
      log(`   · ${collection}.${field} sudah wajib`);
      continue;
    }

    await directus.request(
      updateField(collection, field, {
        schema: { is_nullable: false },
        meta: { required: true },
      }),
    );
    log(`   ✓ ${collection}.${field} kembali wajib`);
  }
};

const bersihkan = async (): Promise<void> => {
  log('\nTahap BERSIHKAN');

  // Data dikosongkan SEBELUM kolomnya dihapus, supaya langkah hapus kolom
  // tidak pernah menyentuh data yang masih dipakai kalau skrip dijalankan
  // sebagian.
  await kosongkanMakanan();
  await kosongkanUkuran();
  await hapusKolom();
  await isiAsalKalori();
  await kencangkanKolom();
};

// ============================================================

const main = async (): Promise<void> => {
  const tahap = process.argv[2];

  log('Migrasi tinjauan September 2026');

  if (tahap === 'siapkan') {
    await siapkan();
  } else if (tahap === 'bersihkan') {
    await bersihkan();
  } else {
    throw new Error('Sebutkan tahapnya: siapkan atau bersihkan');
  }

  log('\nSelesai');
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
