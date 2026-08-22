import { aggregate, createItem, deleteItem, readItems, updateItem } from '@directus/sdk';

import { directus } from '../config/directus.js';
import type { DirectusSchema, UserOwnedCollection } from '../types/directus-schema.js';
import { AppError } from '../utils/api-error.js';
import { withRetry } from './retry.js';
import type { UnitOfWork } from './unit-of-work.js';

/**
 * ============================================================
 * AKSES DATA YANG TERIKAT SATU USER
 * ============================================================
 *
 * Backend memakai admin token, jadi Directus TIDAK menyaring apa pun untuk kita.
 * Satu query yang lupa `filter: { user_id: { _eq: userId } }` berarti data user
 * lain ikut terbaca — kebocoran data antar pengguna.
 *
 * Menjaganya lewat disiplin dan komentar terbukti rapuh. Modul apa pun yang
 * menyentuh data milik user WAJIB lewat sini, karena di sini filter `user_id`
 * disuntikkan otomatis dan tidak ada jalan untuk melewatkannya.
 *
 * ```ts
 * const repo = forUser(userId);
 * await repo.list('weight_logs', { sort: ['-logged_at'] });  // sudah tersaring
 * await repo.create('weight_logs', { weight_kg: '82.5' });   // user_id terisi sendiri
 * await repo.findById('weight_logs', id);                    // 404 kalau bukan miliknya
 * ```
 *
 * ATURAN: jangan panggil readItems / createItem dari @directus/sdk langsung di
 * modul berbasis user. Pemakaian langsung hanya boleh untuk data global seperti
 * `workout_library`, atau untuk pencarian user berdasarkan email saat login.
 */

/**
 * Daftar collection milik user diturunkan otomatis dari definisi schema — setiap
 * collection yang punya kolom `user_id` masuk ke sana. Lihat scripts/generate-types.ts.
 *
 * Tipe inilah yang membuat repo.list('workout_library') ditolak TypeScript:
 * workout_library itu global, bukan milik siapa pun.
 */
export type { UserOwnedCollection };

type ItemOf<C extends UserOwnedCollection> = DirectusSchema[C][number];

/** Data untuk membuat item baru. `user_id` sengaja dibuang — repo yang mengisinya. */
export type CreateData<C extends UserOwnedCollection> = Partial<Omit<ItemOf<C>, 'id' | 'user_id'>>;

/** Data untuk mengubah item. `user_id` dibuang supaya kepemilikan tidak bisa dipindah. */
export type UpdateData<C extends UserOwnedCollection> = Partial<Omit<ItemOf<C>, 'id' | 'user_id'>>;

export interface ListQuery {
  filter?: Record<string, unknown>;
  sort?: string[];
  limit?: number;
  offset?: number;
  fields?: string[];
}

// SDK Directus mengetik fungsi-fungsinya terlalu ketat untuk dibungkus secara
// generik. Cast dipusatkan di sini saja, tidak menyebar ke service.
type UntypedCollection = Parameters<typeof readItems>[0];
type UntypedPayload = Parameters<typeof createItem>[1];

/**
 * Saat dipanggil dari pembungkus generik, SDK meruntuhkan tipe balikannya jadi
 * objek serba `never`, sehingga tidak bisa dicast langsung ke tipe sebenarnya.
 * Helper ini yang menjembatani, dan dipakai HANYA di berkas ini — service tetap
 * menerima tipe yang benar dari DirectusSchema.
 */
const asTyped = <T>(value: unknown): T => value as T;

/**
 * Menggabungkan filter milik pemanggil dengan filter kepemilikan.
 *
 * Memakai _and, bukan menyebar objeknya, supaya filter dari pemanggil tidak
 * mungkin menimpa syarat user_id — sekalipun dia mengirim { user_id: ... }
 * sendiri, syarat kepemilikan tetap ikut diperiksa.
 */
const scopeFilter = (userId: string, filter?: Record<string, unknown>): Record<string, unknown> => {
  const ownership = { user_id: { _eq: userId } };
  return filter ? { _and: [ownership, filter] } : ownership;
};

export interface ScopedRepository {
  list<C extends UserOwnedCollection>(collection: C, query?: ListQuery): Promise<ItemOf<C>[]>;

  /** Mengembalikan null kalau tidak ada. Untuk data yang memang boleh belum ada. */
  findOne<C extends UserOwnedCollection>(
    collection: C,
    query?: ListQuery,
  ): Promise<ItemOf<C> | null>;

  /** Melempar NOT_FOUND kalau tidak ada ATAU bukan milik user ini. */
  findById<C extends UserOwnedCollection>(collection: C, id: string): Promise<ItemOf<C>>;

  count(collection: UserOwnedCollection, filter?: Record<string, unknown>): Promise<number>;

  /** Menjumlahkan satu kolom. Dihitung Postgres, bukan menarik semua baris ke Node. */
  sum(
    collection: UserOwnedCollection,
    field: string,
    filter?: Record<string, unknown>,
  ): Promise<number>;

  create<C extends UserOwnedCollection>(collection: C, data: CreateData<C>): Promise<ItemOf<C>>;

  update<C extends UserOwnedCollection>(
    collection: C,
    id: string,
    data: UpdateData<C>,
  ): Promise<ItemOf<C>>;

  remove(collection: UserOwnedCollection, id: string): Promise<void>;
}

/**
 * @param userId pemilik data yang boleh diakses
 * @param tx     kalau diisi, semua penulisan dicatat unit of work supaya bisa
 *               dibatalkan otomatis saat ada langkah lain yang gagal
 */
export const forUser = (userId: string, tx?: UnitOfWork): ScopedRepository => {
  /** Memastikan item ada dan benar milik user ini sebelum diubah atau dihapus. */
  const assertOwned = async (collection: UserOwnedCollection, id: string): Promise<void> => {
    const rows = await withRetry(
      () =>
        directus.request(
          readItems(
            collection as UntypedCollection,
            {
              filter: scopeFilter(userId, { id: { _eq: id } }),
              limit: 1,
              fields: ['id'],
            } as never,
          ),
        ),
      `assertOwned ${collection}`,
    );

    if ((rows as unknown[]).length === 0) {
      throw AppError.notFound('Data tidak ditemukan');
    }
  };

  return {
    async list(collection, query) {
      const rows = await withRetry(
        () =>
          directus.request(
            readItems(
              collection as UntypedCollection,
              {
                ...query,
                filter: scopeFilter(userId, query?.filter),
              } as never,
            ),
          ),
        `list ${collection}`,
      );

      return asTyped<ItemOf<typeof collection>[]>(rows);
    },

    async findOne(collection, query) {
      const rows = await withRetry(
        () =>
          directus.request(
            readItems(
              collection as UntypedCollection,
              {
                ...query,
                filter: scopeFilter(userId, query?.filter),
                limit: 1,
              } as never,
            ),
          ),
        `findOne ${collection}`,
      );

      return asTyped<ItemOf<typeof collection> | undefined>((rows as unknown[])[0]) ?? null;
    },

    async findById(collection, id) {
      const rows = await withRetry(
        () =>
          directus.request(
            readItems(
              collection as UntypedCollection,
              {
                filter: scopeFilter(userId, { id: { _eq: id } }),
                limit: 1,
              } as never,
            ),
          ),
        `findById ${collection}`,
      );

      const item = (rows as unknown[])[0];

      // Sengaja NOT_FOUND, bukan FORBIDDEN. Membalas "tidak boleh" justru
      // memberi tahu penyerang bahwa id itu ada dan milik orang lain.
      if (!item) {
        throw AppError.notFound('Data tidak ditemukan');
      }

      return asTyped<ItemOf<typeof collection>>(item);
    },

    async count(collection, filter) {
      const result = await withRetry(
        () =>
          directus.request(
            aggregate(
              collection as UntypedCollection,
              {
                aggregate: { count: '*' },
                query: { filter: scopeFilter(userId, filter) },
              } as never,
            ),
          ),
        `count ${collection}`,
      );

      const raw = (result as { count?: string | number | null }[])[0]?.count;
      return raw === null || raw === undefined ? 0 : Number(raw);
    },

    async sum(collection, field, filter) {
      const result = await withRetry(
        () =>
          directus.request(
            aggregate(
              collection as UntypedCollection,
              {
                aggregate: { sum: field },
                query: { filter: scopeFilter(userId, filter) },
              } as never,
            ),
          ),
        `sum ${collection}.${field}`,
      );

      const raw = (result as { sum?: Record<string, string | number | null> }[])[0]?.sum?.[field];
      return raw === null || raw === undefined ? 0 : Number(raw);
    },

    async create(collection, data) {
      const payload = { ...data, user_id: userId };

      if (tx) {
        return tx.create(collection, payload as never);
      }

      const created = await directus.request(
        createItem(collection as UntypedCollection, payload as UntypedPayload),
      );

      return asTyped<ItemOf<typeof collection>>(created);
    },

    async update(collection, id, data) {
      await assertOwned(collection, id);

      if (tx) {
        return tx.update(collection, id, data as never);
      }

      const updated = await directus.request(
        updateItem(collection as UntypedCollection, id, data as UntypedPayload),
      );

      return asTyped<ItemOf<typeof collection>>(updated);
    },

    async remove(collection, id) {
      await assertOwned(collection, id);
      await directus.request(deleteItem(collection as UntypedCollection, id));
    },
  };
};
