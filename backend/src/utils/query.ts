import { z } from 'zod';

import { todayInJakarta } from './daily-key.js';

/**
 * Skema dan helper query yang dipakai berulang oleh module log harian.
 *
 * Enam module (weight, steps, water, sleep, mood, measurements) punya bentuk
 * endpoint yang nyaris sama: ambil hari ini, atau ambil rentang tanggal.
 * Ditaruh di sini supaya aturannya seragam dan hanya perlu diperbaiki sekali.
 */

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Tanggal tidak valid');

/**
 * Rentang tanggal untuk endpoint riwayat.
 *
 * Keduanya opsional. Kalau `to` dikosongkan, dipakai hari ini; kalau `from`
 * dikosongkan, dipakai 30 hari ke belakang — supaya permintaan tanpa parameter
 * tidak diam-diam menarik seluruh riwayat user.
 */
export const DateRangeSchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
  })
  .transform((value) => {
    const to = value.to ?? todayInJakarta();

    const from =
      value.from ??
      new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86_400_000).toISOString().slice(0, 10);

    return { from, to };
  })
  .refine((value) => value.from <= value.to, {
    message: 'Tanggal "from" tidak boleh setelah "to"',
  });

export type DateRangeDto = z.infer<typeof DateRangeSchema>;

/** Satu tanggal, default hari ini menurut WIB. */
export const SingleDateSchema = z.object({
  date: dateString.optional().transform((value) => value ?? todayInJakarta()),
});

export type SingleDateDto = z.infer<typeof SingleDateSchema>;

/** Filter Directus untuk kolom `date` (tanpa jam) dalam rentang inklusif. */
export const dateRangeFilter = (range: DateRangeDto): Record<string, unknown> => ({
  logged_at: { _between: [range.from, range.to] },
});

/**
 * Filter untuk kolom bertipe timestamp yang perlu dibatasi per tanggal.
 *
 * Berbeda dari kolom `date`, timestamp membawa jam sehingga perbandingan
 * langsung dengan "YYYY-MM-DD" akan melewatkan sebagian besar baris di hari
 * terakhir. Batas atasnya karena itu digeser ke awal hari berikutnya.
 */
export const timestampRangeFilter = (range: DateRangeDto): Record<string, unknown> => {
  const setelahHariTerakhir = new Date(new Date(`${range.to}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);

  return {
    logged_at: {
      _gte: `${range.from}T00:00:00`,
      _lt: `${setelahHariTerakhir}T00:00:00`,
    },
  };
};

/** Filter timestamp untuk satu tanggal penuh. */
export const timestampDayFilter = (date: string): Record<string, unknown> =>
  timestampRangeFilter({ from: date, to: date });

export const UuidParamSchema = z.object({
  id: z.uuid({ message: 'Id tidak valid' }),
});

export type UuidParamDto = z.infer<typeof UuidParamSchema>;
