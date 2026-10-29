import { z } from 'zod';

import { dateString } from '../../utils/query.js';

/**
 * Centang "Lagi sakit" di halaman Catat untuk satu tanggal. Backend yang
 * menerjemahkannya jadi rentang: menyalakan di hari pertama berlaku terus
 * sampai dimatikan di hari sembuh (sick-days.ts).
 */
export const SetSickDaySchema = z.object({
  date: dateString,
  sick: z.boolean({ message: 'sick harus true atau false' }),
});

export type SetSickDayDto = z.infer<typeof SetSickDaySchema>;
