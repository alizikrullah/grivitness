import { z } from 'zod';

const timestamp = z.iso.datetime({ message: 'Waktu harus timestamp ISO 8601' });

/** Batas atas yang wajar untuk satu sesi tidur, dipakai menyaring salah input. */
const MAKS_DURASI_JAM = 24;

export const CreateSleepSchema = z
  .object({
    sleep_start: timestamp,
    sleep_end: timestamp,
    quality_score: z
      .number({ message: 'Skor kualitas harus berupa angka' })
      .int('Skor kualitas harus bilangan bulat')
      .min(1, 'Skor kualitas antara 1 sampai 5')
      .max(5, 'Skor kualitas antara 1 sampai 5'),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => new Date(data.sleep_end) > new Date(data.sleep_start), {
    message: 'Waktu bangun harus setelah waktu tidur',
    path: ['sleep_end'],
  })
  .refine(
    (data) => {
      const jam =
        (new Date(data.sleep_end).getTime() - new Date(data.sleep_start).getTime()) / 3_600_000;
      return jam <= MAKS_DURASI_JAM;
    },
    {
      message: `Durasi tidur maksimal ${MAKS_DURASI_JAM} jam`,
      path: ['sleep_end'],
    },
  );

export type CreateSleepDto = z.infer<typeof CreateSleepSchema>;
