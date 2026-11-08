/**
 * Menyelaraskan catatan (note) collection dan field di admin panel Directus
 * dengan directus/schema.ts.
 *
 * Jalankan: npx tsx scripts/selaraskan-catatan.ts            lihat saja, tidak menulis
 *           npx tsx scripts/selaraskan-catatan.ts terapkan   tulis yang berbeda
 *
 * schema:apply cuma mengisi catatan saat collection atau field DIBUAT, dan
 * schema:check tidak membandingkannya. Tanpa skrip ini catatan yang diubah di
 * schema.ts tidak pernah sampai ke admin panel, dan admin panel terus
 * menyebut aturan lama. Kasusnya 8 Nov 2026: catatan device_energy_logs masih
 * menulis kalori aktif jam DITAMBAHKAN penuh, padahal cuma kelebihannya.
 *
 * IDEMPOTEN: yang sudah sama dilewati, aman dijalankan ulang. Cuma menyentuh
 * meta.note; catatan yang tidak ditulis di schema.ts tidak dihapus.
 */

import {
  createDirectus,
  readCollections,
  readFieldsByCollection,
  rest,
  staticToken,
  updateCollection,
  updateField,
} from '@directus/sdk';

import { env } from '../src/config/env.js';
import { collections } from '../directus/schema.js';
import type { LiveCollection, LiveField } from './directus-meta.js';

const client = createDirectus(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_ADMIN_TOKEN))
  .with(rest());

const log = (pesan: string): void => {
  process.stdout.write(`${pesan}\n`);
};

const terapkan = process.argv[2] === 'terapkan';

const main = async (): Promise<void> => {
  log(
    terapkan
      ? 'Menyelaraskan catatan admin panel\n'
      : 'Uji: catatan yang berbeda (tidak menulis)\n',
  );

  const hidup = (await client.request(readCollections())) as LiveCollection[];
  const catatanKoleksi = new Map(hidup.map((c) => [c.collection, c.meta?.note ?? null]));

  let beda = 0;

  for (const def of collections) {
    if (!catatanKoleksi.has(def.collection)) {
      log(`   · ${def.collection} belum ada di Directus, dilewati (jalankan schema:apply)`);
      continue;
    }

    if (catatanKoleksi.get(def.collection) !== def.note) {
      beda++;
      log(`   ${terapkan ? '✓' : '≠'} ${def.collection}`);
      if (terapkan) {
        await client.request(updateCollection(def.collection, { meta: { note: def.note } }));
      }
    }

    const kolom = (await client.request(readFieldsByCollection(def.collection))) as LiveField[];
    const catatanKolom = new Map(kolom.map((k) => [k.field, k.meta?.note ?? null]));

    for (const field of def.fields) {
      if (field.note === undefined || !catatanKolom.has(field.field)) continue;
      if (catatanKolom.get(field.field) === field.note) continue;

      beda++;
      log(`   ${terapkan ? '✓' : '≠'} ${def.collection}.${field.field}`);
      if (terapkan) {
        await client.request(
          updateField(def.collection, field.field, { meta: { note: field.note } }),
        );
      }
    }
  }

  log(
    beda === 0
      ? '\nSemua catatan sudah sama'
      : terapkan
        ? `\n${String(beda)} catatan diperbarui`
        : `\n${String(beda)} catatan berbeda. Jalankan dengan "terapkan" untuk menulisnya.`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
