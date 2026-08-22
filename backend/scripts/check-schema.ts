/**
 * Membandingkan directus/schema.ts dengan keadaan sesungguhnya di Directus.
 *
 * Jalankan: npm run schema:check
 *
 * Berguna untuk menangkap dua hal:
 *   1. Field yang sudah ditambah di kode tapi belum di-apply ke Directus
 *   2. Perubahan yang dibuat lewat UI Directus, yang bikin kode tidak lagi
 *      mencerminkan database
 *
 * Keluar dengan status 1 kalau ada beda, jadi bisa dipakai di CI atau
 * pre-deploy check.
 */

import {
  createDirectus,
  readCollections,
  readFieldsByCollection,
  rest,
  staticToken,
} from '@directus/sdk';

import { env } from '../src/config/env.js';
import { collections, type FieldDef } from '../directus/schema.js';
import type { LiveCollection, LiveField } from './directus-meta.js';

const client = createDirectus(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_ADMIN_TOKEN))
  .with(rest());

const write = (line: string) => process.stdout.write(`${line}\n`);
const ok = (line: string) => write(`  \x1b[32mok\x1b[0m   ${line}`);
const diff = (line: string) => write(`  \x1b[33mbeda\x1b[0m ${line}`);
const gone = (line: string) => write(`  \x1b[31mhilang\x1b[0m ${line}`);

interface Masalah {
  collection: string;
  pesan: string;
}

/**
 * Membandingkan tipe yang didefinisikan dengan tipe yang benar-benar ada.
 * Directus kadang menormalkan tipe, misal decimal bisa terbaca sebagai
 * 'decimal' atau 'float' tergantung versi, jadi perbandingannya dilonggarkan.
 */
const tipeCocok = (didefinisikan: FieldDef['type'], sesungguhnya: string): boolean => {
  if (didefinisikan === sesungguhnya) return true;
  if (didefinisikan === 'decimal') return sesungguhnya === 'float' || sesungguhnya === 'decimal';
  if (didefinisikan === 'timestamp')
    return sesungguhnya === 'dateTime' || sesungguhnya === 'timestamp';
  return false;
};

const main = async (): Promise<void> => {
  write(`\nMembandingkan directus/schema.ts dengan ${env.DIRECTUS_URL}\n`);

  const live = (await client.request(readCollections())) as LiveCollection[];
  const liveNames = new Set(live.map((c) => c.collection));

  const masalah: Masalah[] = [];

  for (const def of collections) {
    if (!liveNames.has(def.collection)) {
      gone(`collection ${def.collection} belum ada di Directus`);
      masalah.push({ collection: def.collection, pesan: 'collection belum di-apply' });
      continue;
    }

    const liveFields = (await client.request(
      readFieldsByCollection(def.collection),
    )) as LiveField[];
    const liveByName = new Map(liveFields.map((f) => [f.field, f]));

    const bedaField: string[] = [];

    for (const field of def.fields) {
      const actual = liveByName.get(field.field);

      if (!actual) {
        bedaField.push(`${field.field} belum ada`);
        continue;
      }

      if (!tipeCocok(field.type, actual.type)) {
        bedaField.push(`${field.field} tipe ${actual.type}, didefinisikan ${field.type}`);
      }

      const nullableSeharusnya = field.nullable ?? false;
      if (actual.schema && actual.schema.is_nullable !== nullableSeharusnya) {
        bedaField.push(
          `${field.field} nullable ${actual.schema.is_nullable}, didefinisikan ${nullableSeharusnya}`,
        );
      }

      // Primary key di Postgres otomatis membawa unique constraint, jadi
      // is_unique-nya selalu true walau tidak ditulis di definisi. Kalau ikut
      // dibandingkan, ke-17 collection akan selalu dilaporkan berbeda.
      if (!field.primaryKey) {
        const uniqueSeharusnya = field.unique ?? false;
        if (actual.schema && (actual.schema.is_unique ?? false) !== uniqueSeharusnya) {
          bedaField.push(
            `${field.field} unique ${actual.schema.is_unique}, didefinisikan ${uniqueSeharusnya}`,
          );
        }
      }
    }

    // Field yang ada di Directus tapi tidak ada di kode — biasanya sisa
    // pengeditan lewat UI, atau alias relasi kebalikan yang memang dibuat Directus.
    const namaDidefinisikan = new Set(def.fields.map((f) => f.field));
    for (const actual of liveFields) {
      if (namaDidefinisikan.has(actual.field)) continue;
      // Alias o2m tidak punya kolom sungguhan di database, jadi bukan masalah.
      if (!actual.schema) continue;
      bedaField.push(`${actual.field} ada di Directus tapi tidak ada di kode`);
    }

    if (bedaField.length === 0) {
      ok(def.collection);
    } else {
      diff(`${def.collection}`);
      for (const b of bedaField) {
        write(`         - ${b}`);
        masalah.push({ collection: def.collection, pesan: b });
      }
    }
  }

  write('');

  if (masalah.length === 0) {
    write('Schema di Directus sudah sesuai definisi di kode.\n');
    return;
  }

  write(`Ditemukan ${masalah.length} ketidaksesuaian.`);
  write('Jalankan `npm run schema:apply` kalau perubahannya memang belum di-apply.\n');
  process.exit(1);
};

main().catch((error: unknown) => {
  const pesan =
    typeof error === 'object' && error !== null && 'errors' in error
      ? JSON.stringify(error.errors)
      : String(error);

  process.stderr.write(`\nGagal memeriksa schema: ${pesan}\n\n`);
  process.exit(1);
});
