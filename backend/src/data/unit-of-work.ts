import { createItem, deleteItem, readItem, updateItem } from '@directus/sdk';

import { directus } from '../config/directus.js';
import type { DirectusSchema } from '../types/directus-schema.js';
import { logger } from '../utils/logger.js';

/**
 * ============================================================
 * PENGGANTI TRANSACTION
 * ============================================================
 *
 * REST API Directus tidak punya transaction. Setiap createItem adalah satu HTTP
 * request yang langsung permanen begitu dibalas 200. Kalau operasi ke-3 gagal,
 * operasi ke-1 dan ke-2 sudah terlanjur tersimpan selamanya.
 *
 * Helper ini membuat pembatalannya OTOMATIS dan tidak mungkin kelupaan: setiap
 * penulisan lewat `tx` dicatat beserta cara membatalkannya. Kalau ada yang gagal,
 * semua yang sudah terlanjur dikerjakan dibatalkan dalam urutan terbalik.
 *
 * ```ts
 * const user = await unitOfWork(async (tx) => {
 *   const user = await tx.create('users', { ... });
 *   await tx.create('streaks', { user_id: user.id });   // gagal di sini
 *   return user;                                        // -> user tadi ikut dihapus
 * });
 * ```
 *
 * BATASNYA HARUS JELAS, ini BUKAN transaction sungguhan:
 *
 * - Ada jeda waktu di mana data setengah jadi terlihat oleh request lain.
 *   Transaction sungguhan tidak pernah membocorkan keadaan itu.
 *
 * - Pembatalannya sendiri berupa HTTP request yang bisa ikut gagal. Kalau itu
 *   terjadi, id-nya dicatat di log level error supaya bisa dibersihkan manual.
 *
 * - Kalau proses Node mati di tengah, tidak ada yang membatalkan apa pun.
 *   Postgres akan otomatis rollback pada transaction sungguhan.
 *
 * Yang bisa dijamin: kegagalan yang WAJAR (validasi ditolak, Directus balas 500,
 * koneksi timeout) tidak akan meninggalkan data setengah jadi.
 */

type CollectionName = keyof DirectusSchema;
type ItemOf<C extends CollectionName> = DirectusSchema[C][number];

interface UndoStep {
  label: string;
  run: () => Promise<void>;
}

export interface UnitOfWork {
  /** Membuat item baru. Pembatalannya: menghapus item itu. */
  create<C extends CollectionName>(collection: C, data: Partial<ItemOf<C>>): Promise<ItemOf<C>>;

  /**
   * Mengubah item. Nilai lama field yang diubah dibaca lebih dulu, jadi
   * pembatalannya mengembalikan nilai semula, bukan sekadar menghapus.
   */
  update<C extends CollectionName>(
    collection: C,
    id: string,
    data: Partial<ItemOf<C>>,
  ): Promise<ItemOf<C>>;

  /**
   * Mendaftarkan pembatalan manual untuk hal di luar database, paling sering
   * file yang sudah terlanjur diupload ke Directus storage.
   *
   * ```ts
   * const fileId = await uploadToDirectus(buffer);
   * tx.onRollback(() => deleteFile(fileId), `file ${fileId}`);
   * ```
   */
  onRollback(undo: () => Promise<void>, label: string): void;
}

/**
 * SDK Directus mengetik createItem/updateItem dengan generic yang sangat ketat dan
 * tidak bisa dilewati lewat pembungkus generik seperti ini. Cast dipusatkan di dua
 * tempat di bawah dan tidak menyebar ke seluruh service.
 *
 * Keamanan tipenya tetap terjaga di permukaan: parameter dan nilai balik fungsi
 * publiknya tetap terikat ke DirectusSchema.
 */
type UntypedCollection = Parameters<typeof createItem>[0];
type UntypedPayload = Parameters<typeof createItem>[1];

/** Menjembatani tipe balikan SDK yang runtuh jadi serba `never` di pembungkus generik. */
const asTyped = <T>(value: unknown): T => value as T;

export const unitOfWork = async <T>(work: (tx: UnitOfWork) => Promise<T>): Promise<T> => {
  const undoSteps: UndoStep[] = [];

  const tx: UnitOfWork = {
    async create(collection, data) {
      const created = await directus.request(
        createItem(collection as UntypedCollection, data as UntypedPayload),
      );

      const id = asTyped<{ id: string }>(created).id;

      undoSteps.push({
        label: `hapus ${collection}/${id}`,
        run: async () => {
          await directus.request(deleteItem(collection as UntypedCollection, id));
        },
      });

      return asTyped<ItemOf<typeof collection>>(created);
    },

    async update(collection, id, data) {
      // Baca nilai lama HANYA untuk field yang akan diubah, supaya pembatalannya
      // tidak ikut menimpa field lain yang tidak tersentuh.
      const changedFields = Object.keys(data);

      const before = asTyped<Record<string, unknown>>(
        await directus.request(
          readItem(collection as UntypedCollection, id, { fields: changedFields } as never),
        ),
      );

      const updated = await directus.request(
        updateItem(collection as UntypedCollection, id, data as UntypedPayload),
      );

      undoSteps.push({
        label: `kembalikan ${collection}/${id}`,
        run: async () => {
          await directus.request(
            updateItem(collection as UntypedCollection, id, before as UntypedPayload),
          );
        },
      });

      return asTyped<ItemOf<typeof collection>>(updated);
    },

    onRollback(undo, label) {
      undoSteps.push({ label, run: undo });
    },
  };

  try {
    return await work(tx);
  } catch (error) {
    await rollback(undoSteps);
    throw error;
  }
};

/**
 * Membatalkan dalam urutan terbalik supaya anak dihapus sebelum induknya, * kalau induk dihapus duluan, foreign key bisa menolak atau justru ikut
 * meng-cascade hal yang tidak diinginkan.
 *
 * Setiap langkah dibungkus try sendiri: satu pembatalan yang gagal tidak boleh
 * menghentikan sisanya, dan tidak boleh menutupi error aslinya.
 */
const rollback = async (steps: UndoStep[]): Promise<void> => {
  const gagal: string[] = [];

  for (const step of [...steps].reverse()) {
    try {
      await step.run();
    } catch (error) {
      gagal.push(step.label);
      logger.error({ err: error, langkah: step.label }, 'Satu langkah pembatalan gagal');
    }
  }

  if (gagal.length > 0) {
    logger.error(
      { langkah_gagal: gagal },
      'Pembatalan tidak tuntas. Ada data menggantung yang perlu dibersihkan manual.',
    );
  } else if (steps.length > 0) {
    logger.warn({ jumlah: steps.length }, 'Operasi dibatalkan, semua perubahan berhasil ditarik');
  }
};
