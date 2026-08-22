/**
 * Bentuk data metadata Directus yang dipakai script schema.
 *
 * Client di script sengaja dibuat tanpa generic DirectusSchema, karena yang
 * disentuh justru endpoint sistem (/collections, /fields, /relations) — bukan
 * collection aplikasi. Akibatnya SDK mengembalikan `any`, yang membuat seluruh
 * pemakaiannya lolos dari pemeriksaan tipe.
 *
 * Tipe di bawah mengembalikan pemeriksaan itu: hasil dari SDK di-cast sekali ke
 * bentuk yang benar, lalu sisanya ter-typecheck seperti biasa.
 */

export interface LiveCollection {
  collection: string;
  meta?: { icon?: string | null; note?: string | null } | null;
}

export interface LiveFieldSchema {
  is_nullable?: boolean;
  is_unique?: boolean;
  is_primary_key?: boolean;
  max_length?: number | null;
  numeric_precision?: number | null;
  numeric_scale?: number | null;
  default_value?: unknown;
}

export interface LiveField {
  field: string;
  type: string;
  /** Null untuk field alias seperti relasi kebalikan, yang tidak punya kolom sungguhan. */
  schema?: LiveFieldSchema | null;
  meta?: { note?: string | null; options?: Record<string, unknown> | null } | null;
}

export interface LiveRelation {
  collection?: string;
  field?: string;
  related_collection?: string | null;
}
