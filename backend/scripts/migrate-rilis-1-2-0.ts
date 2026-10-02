/**
 * Migrasi satu kali untuk rilis 1.2.0, Oktober 2026.
 *
 * Jalankan: npx tsx scripts/migrate-rilis-1-2-0.ts
 *
 * schema:apply sengaja tidak pernah mengubah kolom yang sudah ada, jadi kolom
 * yang dilonggarkan di directus/schema.ts harus lewat jalur ini. IDEMPOTEN:
 * yang sudah sesuai dilewati, aman dijalankan ulang.
 *
 * Cuma satu tahap, karena tidak ada yang dicabut. Melonggarkan kolom aman
 * dijalankan SEBELUM deploy: kode lama tetap mengisi intensitas (APK lama
 * masih mengirimnya), kode baru boleh mengosongkannya.
 *
 *   workout_logs.intensity   jadi nullable. Form berhenti menanyakannya karena
 *                            tidak dipakai hitungan apa pun; kalori datang dari
 *                            MET jenis olahraganya.
 *
 * Catatan admin panel untuk aturan kalori jam tangan ikut diperbarui dari
 * directus/schema.ts: dulu tertulis angka jam MENGGANTIKAN rumus, sekarang
 * kalori aktifnya DITAMBAHKAN. schema:apply tidak menyentuh catatan field
 * yang sudah ada, jadi tanpa langkah ini admin panel menyebut aturan lama.
 *
 * Yang TIDAK perlu migrasi: goals.budget_manual dibuat schema:apply dengan
 * bawaan false, sehingga semua goal lama otomatis jadi jatah otomatis. Itu
 * memang keputusannya: jatah goal yang aktif sekarang hasil hitungan, angkanya
 * tidak bulat, dan pemiliknya tidak pernah mengetiknya sendiri.
 */

import { readFieldsByCollection, updateCollection, updateField } from '@directus/sdk';

import { collections } from '../directus/schema.js';
import { directus } from '../src/config/directus.js';

const log = (pesan: string): void => {
  process.stdout.write(`${pesan}\n`);
};

interface KolomHidup {
  field: string;
  schema: { is_nullable?: boolean } | null;
}

const KOLOM_DILONGGARKAN: readonly (readonly [string, string])[] = [['workout_logs', 'intensity']];

/** Catatan field yang isinya berubah di rilis ini. */
const CATATAN_DIPERBARUI: readonly (readonly [string, string])[] = [
  ['device_energy_logs', 'total_kcal'],
  ['workout_logs', 'tracked_by_device'],
  ['workout_logs', 'intensity'],
  ['goals', 'daily_calorie_budget'],
];

const longgarkan = async (): Promise<void> => {
  log('Kolom dilonggarkan jadi nullable');

  for (const [collection, field] of KOLOM_DILONGGARKAN) {
    const kolom = (
      (await directus.request(readFieldsByCollection(collection))) as KolomHidup[]
    ).find((k) => k.field === field);

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

const selaraskanCatatan = async (): Promise<void> => {
  log('\nCatatan admin panel diselaraskan dengan schema.ts');

  const koleksiDevice = collections.find((c) => c.collection === 'device_energy_logs');
  if (koleksiDevice) {
    await directus.request(
      updateCollection('device_energy_logs', { meta: { note: koleksiDevice.note } }),
    );
    log('   ✓ device_energy_logs');
  }

  for (const [collection, field] of CATATAN_DIPERBARUI) {
    const note = collections
      .find((c) => c.collection === collection)
      ?.fields.find((d) => d.field === field)?.note;
    if (!note) continue;

    await directus.request(updateField(collection, field, { meta: { note } }));
    log(`   ✓ ${collection}.${field}`);
  }
};

const main = async (): Promise<void> => {
  log('Migrasi rilis 1.2.0\n');
  await longgarkan();
  await selaraskanCatatan();
  log('\nSelesai');
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
