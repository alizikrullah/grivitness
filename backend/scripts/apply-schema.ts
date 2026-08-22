/**
 * Apply definisi di directus/schema.ts ke instance Directus.
 *
 * Jalankan: npm run schema:apply
 *
 * Script ini idempotent — aman dijalankan berulang kali. Yang sudah ada dilewati,
 * yang belum ada dibuat. Script ini TIDAK pernah menghapus collection atau field,
 * jadi tidak bisa merusak data yang sudah masuk.
 *
 * Urutan eksekusi dibagi tiga tahap karena relasi merujuk collection lain yang
 * belum tentu sudah dibuat kalau diproses satu-per-satu:
 *   1. Bikin semua collection beserta primary key-nya
 *   2. Bikin semua field biasa (FK masih berupa kolom uuid polos)
 *   3. Bikin semua relasi (menambahkan foreign key constraint)
 */

import {
  createCollection,
  createDirectus,
  createField,
  createRelation,
  readCollections,
  readFieldsByCollection,
  readRelations,
  rest,
  staticToken,
} from '@directus/sdk';

import { env } from '../src/config/env.js';
import { collections, type FieldDef } from '../directus/schema.js';
import type { LiveCollection, LiveField, LiveRelation } from './directus-meta.js';

const client = createDirectus(env.DIRECTUS_URL)
  .with(staticToken(env.DIRECTUS_ADMIN_TOKEN))
  .with(rest());

// ============================================================
// OUTPUT
// ============================================================

const write = (line: string) => process.stdout.write(`${line}\n`);
const ok = (line: string) => write(`  \x1b[32m+\x1b[0m ${line}`);
const skip = (line: string) => write(`  \x1b[90m·\x1b[0m ${line}`);
const fail = (line: string) => write(`  \x1b[31mx\x1b[0m ${line}`);
const heading = (line: string) => write(`\n\x1b[1m${line}\x1b[0m`);

/** Error dari Directus SDK membawa array `errors`, bukan Error biasa. */
const describeError = (error: unknown): string => {
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const { errors } = error as { errors?: { message?: string }[] };
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.map((e) => e.message ?? 'unknown').join('; ');
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
};

// ============================================================
// PEMETAAN DSL -> PAYLOAD DIRECTUS
// ============================================================

const interfaceFor = (def: FieldDef): string => {
  if (def.special?.includes('file')) return 'file';
  if (def.choices) return 'select-dropdown';

  switch (def.type) {
    case 'text':
      return 'input-multiline';
    case 'boolean':
      return 'boolean';
    case 'date':
    case 'timestamp':
      return 'datetime';
    case 'json':
      return 'input-code';
    default:
      return 'input';
  }
};

interface FieldPayload {
  field: string;
  type: string;
  schema: Record<string, unknown>;
  meta: Record<string, unknown>;
}

const toFieldPayload = (def: FieldDef, sort: number): FieldPayload => {
  const schema: Record<string, unknown> = {
    is_nullable: def.nullable ?? false,
  };

  if (def.primaryKey) {
    schema.is_primary_key = true;
    schema.has_auto_increment = false;
  }
  if (def.unique) schema.is_unique = true;
  if (def.maxLength !== undefined) schema.max_length = def.maxLength;
  if (def.precision !== undefined) schema.numeric_precision = def.precision;
  if (def.scale !== undefined) schema.numeric_scale = def.scale;
  if (def.defaultValue !== undefined) schema.default_value = def.defaultValue;

  const meta: Record<string, unknown> = {
    interface: interfaceFor(def),
    hidden: def.hidden ?? false,
    readonly: def.readonly ?? false,
    // Field readonly diisi otomatis (uuid, date-created), jadi jangan ditandai wajib
    // di form admin panel — nanti malah tidak bisa disimpan.
    required: !(def.nullable ?? false) && !def.readonly && !def.primaryKey,
    sort,
  };

  if (def.note) meta.note = def.note;
  if (def.special) meta.special = [...def.special];
  if (def.choices) {
    meta.options = { choices: def.choices.map((value) => ({ text: value, value })) };
    meta.display = 'labels';
  }

  return { field: def.field, type: def.type, schema, meta };
};

// ============================================================
// TAHAP 1 — COLLECTION
// ============================================================

const applyCollections = async (existing: Set<string>): Promise<number> => {
  heading('Tahap 1/3 — Collection');
  let created = 0;

  for (const def of collections) {
    if (existing.has(def.collection)) {
      skip(`${def.collection} sudah ada`);
      continue;
    }

    const primaryKey = def.fields.find((f) => f.primaryKey);
    if (!primaryKey) {
      fail(`${def.collection} tidak punya primary key di definisi schema`);
      throw new Error(`Collection ${def.collection} wajib punya field dengan primaryKey: true`);
    }

    await client.request(
      createCollection({
        collection: def.collection,
        meta: { icon: def.icon, note: def.note, sort_field: null },
        schema: { name: def.collection },
        fields: [toFieldPayload(primaryKey, 1)],
      }),
    );

    ok(`${def.collection}`);
    created += 1;
  }

  return created;
};

// ============================================================
// TAHAP 2 — FIELD
// ============================================================

const applyFields = async (): Promise<number> => {
  heading('Tahap 2/3 — Field');
  let created = 0;

  for (const def of collections) {
    const current = (await client.request(readFieldsByCollection(def.collection))) as LiveField[];
    const existing = new Set(current.map((f) => f.field));

    const pending = def.fields.filter((f) => !f.primaryKey && !existing.has(f.field));

    if (pending.length === 0) {
      skip(`${def.collection} — semua field sudah ada`);
      continue;
    }

    for (const [index, field] of def.fields.entries()) {
      if (field.primaryKey || existing.has(field.field)) continue;

      await client.request(createField(def.collection, toFieldPayload(field, index + 1)));
      created += 1;
    }

    ok(`${def.collection} — ${pending.length} field ditambahkan`);
  }

  return created;
};

// ============================================================
// TAHAP 3 — RELASI
// ============================================================

const relationKey = (collection: string, field: string) => `${collection}.${field}`;

const applyRelations = async (): Promise<number> => {
  heading('Tahap 3/3 — Relasi');

  const current = (await client.request(readRelations())) as LiveRelation[];
  const existing = new Set(current.map((r) => relationKey(r.collection ?? '', r.field ?? '')));

  let created = 0;

  for (const def of collections) {
    for (const field of def.fields) {
      if (!field.relation) continue;

      const key = relationKey(def.collection, field.field);
      if (existing.has(key)) {
        skip(`${key} sudah ada`);
        continue;
      }

      const { relatedCollection, onDelete, oneField } = field.relation;

      await client.request(
        createRelation({
          collection: def.collection,
          field: field.field,
          related_collection: relatedCollection,
          meta: {
            one_field: oneField ?? null,
            sort_field: null,
            // Saat item induk dilepas dari relasi, kosongkan FK-nya, jangan hapus itemnya.
            one_deselect_action: 'nullify',
          },
          schema: { on_delete: onDelete },
        }),
      );

      ok(`${key} -> ${relatedCollection} (ON DELETE ${onDelete})`);
      created += 1;
    }
  }

  return created;
};

// ============================================================
// MAIN
// ============================================================

const main = async () => {
  write(`\nTarget Directus : ${env.DIRECTUS_URL}`);
  write(`Collection      : ${collections.length}`);
  write(`Total field     : ${collections.reduce((sum, c) => sum + c.fields.length, 0)}`);

  const existingCollections = (await client.request(readCollections())) as LiveCollection[];
  const existing = new Set(existingCollections.map((c) => c.collection));

  const collectionsCreated = await applyCollections(existing);
  const fieldsCreated = await applyFields();
  const relationsCreated = await applyRelations();

  heading('Selesai');
  write(`  collection dibuat : ${collectionsCreated}`);
  write(`  field dibuat      : ${fieldsCreated}`);
  write(`  relasi dibuat     : ${relationsCreated}`);
  write('');

  if (collectionsCreated + fieldsCreated + relationsCreated === 0) {
    write('Schema di Directus sudah sesuai definisi, tidak ada perubahan.\n');
  } else {
    write('Jalankan `npm run schema:snapshot` untuk menyimpan versi schema ke git.\n');
  }
};

main().catch((error: unknown) => {
  fail(describeError(error));
  write('');
  process.exit(1);
});
