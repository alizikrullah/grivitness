/**
 * Meng-generate src/types/directus-schema.ts dari directus/schema.ts.
 *
 * Jalankan: npm run schema:types
 *
 * Sebelumnya tipe TypeScript ditulis tangan dan harus dijaga selaras dengan
 * definisi schema secara manual. Kalau ada field yang ditambah di satu tempat
 * saja, TypeScript tidak akan protes dan kesalahannya baru ketahuan saat runtime.
 *
 * Dengan di-generate, ketidakselarasan itu tidak mungkin terjadi: definisi
 * schema jadi satu-satunya sumber kebenaran, tipenya sekadar turunan.
 *
 * JANGAN mengedit file hasilnya. Ubah directus/schema.ts lalu jalankan ini lagi.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  ACTIVITY_LEVEL,
  GENDER,
  MEAL_TYPE,
  WORKOUT_CATEGORY,
  WORKOUT_INTENSITY,
} from '../src/constants/enums.js';
import { collections, type CollectionDef, type FieldDef } from '../directus/schema.js';

const OUTPUT_PATH = fileURLToPath(new URL('../src/types/directus-schema.ts', import.meta.url));

/**
 * Dicocokkan berdasarkan identitas objek, bukan isinya. Karena setiap field enum
 * memakai konstanta yang sama persis dari constants/enums.ts, pencocokan ini
 * selalu tepat tanpa perlu menuliskan nama tipe ulang di definisi schema.
 */
const ENUM_TYPES = new Map<readonly string[], string>([
  [GENDER, 'Gender'],
  [ACTIVITY_LEVEL, 'ActivityLevel'],
  [MEAL_TYPE, 'MealType'],
  [WORKOUT_INTENSITY, 'WorkoutIntensity'],
  [WORKOUT_CATEGORY, 'WorkoutCategory'],
]);

const BASE_TYPES: Record<FieldDef['type'], string> = {
  uuid: 'string',
  string: 'string',
  text: 'string',
  integer: 'number',
  decimal: 'DecimalString',
  boolean: 'boolean',
  date: 'DateString',
  timestamp: 'TimestampString',
  json: 'Record<string, unknown>',
};

const tsTypeOf = (field: FieldDef): string => {
  const base = field.choices
    ? (ENUM_TYPES.get(field.choices) ?? field.choices.map((c) => `'${c}'`).join(' | '))
    : BASE_TYPES[field.type];

  return field.nullable ? `${base} | null` : base;
};

/** Membungkus catatan field jadi komentar JSDoc, dipecah supaya barisnya tidak terlalu panjang. */
const renderNote = (note: string, indent: string): string => {
  const words = note.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + word).length > 88) {
      lines.push(current.trimEnd());
      current = '';
    }
    current += `${word} `;
  }
  if (current.trim()) lines.push(current.trimEnd());

  if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;

  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
};

const renderInterface = (def: CollectionDef): string => {
  const fields = def.fields
    .map((field) => {
      const note = field.note ? renderNote(field.note, '  ') : '';
      return `${note}  ${field.field}: ${tsTypeOf(field)};`;
    })
    .join('\n');

  return `${renderNote(def.note, '')}export interface ${def.typeName} {\n${fields}\n}`;
};

/**
 * Collection yang punya kolom user_id berarti barisnya dimiliki seorang user.
 * Diturunkan otomatis, bukan didaftar manual, supaya collection baru langsung
 * ikut terlindungi pembatasan akses di data/scoped.ts tanpa perlu diingat.
 */
const userOwned = collections.filter((c) => c.fields.some((f) => f.field === 'user_id'));

const header = `/**
 * BERKAS INI DI-GENERATE OTOMATIS — JANGAN DIEDIT MANUAL.
 *
 * Sumbernya: directus/schema.ts
 * Perintah  : npm run schema:types
 *
 * Perubahan apa pun di sini akan tertimpa saat generator dijalankan lagi.
 * Untuk menambah atau mengubah field, edit directus/schema.ts lalu jalankan
 * \`npm run schema:types\` dan \`npm run schema:apply\`.
 */

import type {
  ActivityLevel,
  Gender,
  MealType,
  WorkoutCategory,
  WorkoutIntensity,
} from '../constants/enums.js';

/**
 * Kolom decimal dikembalikan Directus sebagai STRING, bukan number.
 * Sudah diverifikasi langsung ke instance: weight_kg 82.55 terbaca "82.55".
 *
 * Jangan pernah dipakai aritmetika langsung. Konversi dulu dengan toNumber()
 * dari utils/number.ts. Lihat CLAUDE.md section 13.
 */
export type DecimalString = string;

/** Tanggal tanpa jam, format YYYY-MM-DD. */
export type DateString = string;

/** Timestamp ISO 8601 dengan timezone. */
export type TimestampString = string;
`;

const main = async (): Promise<void> => {
  const interfaces = collections.map(renderInterface).join('\n\n');

  const schemaEntries = collections.map((c) => `  ${c.collection}: ${c.typeName}[];`).join('\n');

  const ownedUnion = userOwned.map((c) => `  | '${c.collection}'`).join('\n');

  const body = `${header}
${interfaces}

/**
 * Collection yang setiap barisnya dimiliki seorang user, ditandai kolom user_id.
 * Diturunkan otomatis dari definisi schema.
 */
export type UserOwnedCollection =
${ownedUnion};

/** Dipasang sebagai generic di createDirectus<DirectusSchema>() agar SDK ter-typecheck. */
export interface DirectusSchema {
${schemaEntries}
}
`;

  await writeFile(OUTPUT_PATH, body, 'utf8');

  process.stdout.write(
    `\nTipe di-generate ke src/types/directus-schema.ts\n` +
      `  interface        : ${collections.length}\n` +
      `  field            : ${collections.reduce((n, c) => n + c.fields.length, 0)}\n` +
      `  milik user       : ${userOwned.length}\n\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(`\nGagal generate tipe: ${String(error)}\n\n`);
  process.exit(1);
});
