import { z } from 'zod';

import { dateString } from '../../utils/query.js';

export const DailySummarySchema = z.object({
  date: dateString.optional(),
});

export const WeeklySummarySchema = z.object({
  /** Tanggal mulai pekan. Kalau dikosongkan, dipakai 6 hari ke belakang. */
  from: dateString.optional(),
});

export const MonthlySummarySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200).optional(),
  month: z.coerce
    .number()
    .int()
    .min(1, 'Bulan antara 1-12')
    .max(12, 'Bulan antara 1-12')
    .optional(),
});

export type DailySummaryDto = z.infer<typeof DailySummarySchema>;
export type WeeklySummaryDto = z.infer<typeof WeeklySummarySchema>;
export type MonthlySummaryDto = z.infer<typeof MonthlySummarySchema>;

export const HistorySummarySchema = z.object({
  /** Berapa hari ke belakang sampai hari ini. Bawaan 30, maksimal 90. */
  days: z.coerce.number().int().min(7).max(90).optional(),
});

export type HistorySummaryDto = z.infer<typeof HistorySummarySchema>;

/** Layar catat yang punya kalender. Satu jenis data per layar. */
export const CALENDAR_SECTIONS = [
  'food',
  'water',
  'workout',
  'steps',
  'sleep',
  'weight',
  'mood',
  'body-photo',
  'device-energy',
] as const;
export type CalendarSection = (typeof CALENDAR_SECTIONS)[number];

/** Rentang yang wajar untuk satu tampilan kalender: sebulan plus tepinya. */
const MAKS_HARI_KALENDER = 100;

export const CalendarSchema = z
  .object({
    type: z.enum(CALENDAR_SECTIONS, { message: 'Jenis kalender tidak dikenal' }),
    from: dateString,
    to: dateString,
  })
  .refine((v) => v.from <= v.to, { message: 'Tanggal "from" tidak boleh setelah "to"' })
  .refine(
    (v) =>
      (new Date(`${v.to}T00:00:00Z`).getTime() - new Date(`${v.from}T00:00:00Z`).getTime()) /
        86_400_000 <
      MAKS_HARI_KALENDER,
    { message: `Rentang kalender maksimal ${MAKS_HARI_KALENDER} hari` },
  );

export type CalendarDto = z.infer<typeof CalendarSchema>;
