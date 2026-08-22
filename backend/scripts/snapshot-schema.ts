/**
 * Tarik snapshot schema terkini dari Directus, simpan ke directus/snapshot.json.
 *
 * Jalankan: npm run schema:snapshot
 *
 * File hasilnya di-commit ke git sebagai versi schema. Dengan begitu perubahan
 * struktur database ikut terlihat di diff, sama seperti file migration pada ORM.
 * Jalankan setiap selesai `npm run schema:apply`.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createDirectus, rest, schemaSnapshot, staticToken } from '@directus/sdk';

import { env } from '../src/config/env.js';

const client = createDirectus(env.DIRECTUS_URL).with(staticToken(env.DIRECTUS_ADMIN_TOKEN)).with(rest());

const OUTPUT_PATH = fileURLToPath(new URL('../directus/snapshot.json', import.meta.url));

const write = (line: string) => process.stdout.write(`${line}\n`);

const main = async () => {
  const snapshot = await client.request(schemaSnapshot());

  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const { collections, fields, relations } = snapshot as {
    collections: unknown[];
    fields: unknown[];
    relations: unknown[];
  };

  write('\nSnapshot schema tersimpan.');
  write(`  file       : directus/snapshot.json`);
  write(`  collection : ${collections.length}`);
  write(`  field      : ${fields.length}`);
  write(`  relasi     : ${relations.length}`);
  write('\nCommit file ini supaya perubahan schema terekam di git.\n');
};

main().catch((error: unknown) => {
  const message =
    typeof error === 'object' && error !== null && 'errors' in error
      ? JSON.stringify((error as { errors: unknown }).errors)
      : String(error);

  process.stderr.write(`\nGagal mengambil snapshot: ${message}\n\n`);
  process.exit(1);
});
