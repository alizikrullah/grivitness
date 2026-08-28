import { z } from 'zod';

import { dateString } from '../../utils/query.js';

/**
 * Jam tangan tidak semuanya menampilkan angka yang sama.
 *
 * Sebagian punya "kalori total" yang sudah menjumlahkan metabolisme istirahat
 * dengan kalori aktif. Sebagian lain HANYA punya kalori aktif. Karena itu user
 * memasukkan salah satu, bukan dipaksa menyediakan angka yang perangkatnya
 * memang tidak punya.
 *
 * Kalau yang diberikan kalori aktif, backend yang menambahkan BMR user untuk
 * memperoleh totalnya, dan kedua angka asalnya tetap disimpan supaya hasil
 * turunannya bisa ditelusuri.
 */

/**
 * Batas atas mengacu pada pengeluaran harian pembalap Tour de France, sekitar
 * 8000 sampai 9000 kkal, yang praktis adalah langit-langit manusia untuk satu
 * hari. Batas bawah kalori total mengikuti metabolisme istirahat orang dewasa
 * terkecil, yang masih di atas 800 kkal sehari.
 *
 * Pagar yang lebih tajam ada di service: angka total yang di bawah BMR user
 * SENDIRI ditolak, karena itu tanda yang tersalin justru kalori aktifnya.
 */
const MAKS_KKAL = 10_000;

export const CreateDeviceEnergySchema = z
  .object({
    /** Kalori total sehari, sudah termasuk metabolisme istirahat. */
    total_kcal: z
      .number({ message: 'Kalori harus berupa angka' })
      .int('Kalori harus bilangan bulat')
      .min(500, 'Kalori terlalu kecil untuk sebuah total harian')
      .max(MAKS_KKAL, 'Kalori melebihi batas wajar untuk satu hari')
      .optional(),

    /**
     * Kalori aktif saja, tanpa metabolisme istirahat.
     *
     * Batas bawahnya nol, bukan 500: hari yang benar-benar dihabiskan berbaring
     * memang bisa nyaris tanpa kalori aktif, dan itu bukan kesalahan input.
     */
    active_kcal: z
      .number({ message: 'Kalori harus berupa angka' })
      .int('Kalori harus bilangan bulat')
      .min(0, 'Kalori aktif tidak boleh negatif')
      .max(MAKS_KKAL, 'Kalori melebihi batas wajar untuk satu hari')
      .optional(),

    source: z.string().trim().min(1).max(64).optional(),
    notes: z.string().max(1000).optional(),
    logged_at: dateString.optional(),
  })
  .superRefine((data, ctx) => {
    const diisi = [data.total_kcal, data.active_kcal].filter((n) => n !== undefined);

    if (diisi.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['total_kcal'],
        message: 'Isi salah satu: kalori total atau kalori aktif',
      });
      return;
    }

    // Keduanya sekaligus berarti ada dua kebenaran yang bisa saling
    // bertentangan, dan tidak ada cara memilih mana yang menang.
    if (diisi.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['active_kcal'],
        message: 'Pilih salah satu saja: kalori total atau kalori aktif',
      });
    }
  });

export type CreateDeviceEnergyDto = z.infer<typeof CreateDeviceEnergySchema>;
