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
