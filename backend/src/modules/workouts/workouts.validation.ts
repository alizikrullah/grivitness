import { z } from 'zod';

import { WORKOUT_CATEGORY, WORKOUT_INTENSITY, WORKOUT_MEASURE } from '../../constants/enums.js';
import { dateString } from '../../utils/query.js';

interface UkuranSesi {
  duration_minutes?: number;
  sets?: number;
  reps?: number;
  hold_seconds?: number;
}

/**
 * Satu sesi harus punya TEPAT satu cara ukur: menit (TIME), set x ulangan
 * (REPS), atau set x detik (HOLD). Ulangan dan detik tahan tidak boleh
 * bersamaan; set tanpa keduanya tidak berarti apa-apa.
 */
const tegakkanUkuran = (data: UkuranSesi, ctx: z.RefinementCtx): void => {
  const adaReps = data.reps !== undefined;
  const adaHold = data.hold_seconds !== undefined;

  if (adaReps && adaHold) {
    ctx.addIssue({
      code: 'custom',
      path: ['hold_seconds'],
      message: 'Pilih salah satu: ulangan atau detik tahan',
    });
  }
  if (data.sets !== undefined && !adaReps && !adaHold) {
    ctx.addIssue({
      code: 'custom',
      path: ['sets'],
      message: 'Set butuh ulangan per set atau detik tahan per set',
    });
  }
};

/**
 * Sebuah log olahraga bisa bersumber dari tiga tempat, dan sumbernya menentukan
 * dari mana NAMANYA berasal:
 *
 *   workout_library_id -> dipilih dari library global
 *   custom_workout_id  -> dipilih dari custom workout milik user
 *   keduanya kosong     -> input manual, user mengisi namanya sendiri
 *
 * KALORINYA urusan terpisah. Untuk library dan custom, backend menghitungnya
 * dari MET kalau user tidak mengisi; kalau user mengisi, angka user yang
 * dipakai dan ditandai MANUAL. Ini yang memungkinkan angka jam tangan untuk
 * satu sesi dicatat apa adanya, tanpa harus memilih "olahraga manual" dan
 * kehilangan kaitannya ke library.
 *
 * Aturan itu ditegakkan di sini supaya service tidak menerima kombinasi yang
 * tidak masuk akal, misalnya dua sumber sekaligus atau tidak ada sumber sama
 * sekali tanpa nama olahraga.
 */
export const CreateWorkoutSchema = z
  .object({
    workout_library_id: z.uuid({ message: 'Id library tidak valid' }).optional(),
    custom_workout_id: z.uuid({ message: 'Id custom workout tidak valid' }).optional(),

    /** Wajib untuk input manual, diabaikan kalau sumbernya library atau custom. */
    workout_name: z.string().trim().min(2, 'Nama olahraga minimal 2 karakter').max(255).optional(),

    /**
     * Menit, untuk olahraga berukuran TIME. Untuk REPS/HOLD dikosongkan dan
     * backend menurunkannya dari set x ulangan x detik per ulangan.
     */
    duration_minutes: z
      .number({ message: 'Durasi harus berupa angka' })
      .int('Durasi harus bilangan bulat')
      .min(1, 'Durasi minimal 1 menit')
      .max(1440, 'Durasi maksimal 1440 menit')
      .optional(),

    /** Set x ulangan (REPS) atau set x detik tahan (HOLD). Beban opsional, catatan progres. */
    sets: z
      .number({ message: 'Set harus berupa angka' })
      .int('Set harus bilangan bulat')
      .min(1, 'Set minimal 1')
      .max(100, 'Set tidak masuk akal')
      .optional(),
    reps: z
      .number({ message: 'Ulangan harus berupa angka' })
      .int('Ulangan harus bilangan bulat')
      .min(1, 'Ulangan minimal 1')
      .max(1000, 'Ulangan tidak masuk akal')
      .optional(),
    hold_seconds: z
      .number({ message: 'Detik tahan harus berupa angka' })
      .int('Detik tahan harus bilangan bulat')
      .min(1, 'Detik tahan minimal 1')
      .max(3600, 'Detik tahan tidak masuk akal')
      .optional(),
    load_kg: z
      .number({ message: 'Beban harus berupa angka' })
      .min(0, 'Beban tidak boleh negatif')
      .max(500, 'Beban tidak masuk akal')
      .optional(),

    /**
     * Wajib untuk input manual. Untuk library dan custom OPSIONAL: kosong
     * berarti dihitung backend dari MET, terisi berarti angka user yang dipakai.
     */
    calories_burned: z
      .number({ message: 'Kalori harus berupa angka' })
      .int('Kalori harus bilangan bulat')
      .min(0, 'Kalori tidak boleh negatif')
      .max(20_000, 'Kalori tidak masuk akal')
      .optional(),

    intensity: z.enum(WORKOUT_INTENSITY),

    /**
     * true kalau sesi ini SUDAH ikut terhitung di angka smartwatch hari itu.
     *
     * Menentukan apakah kalorinya boleh ditambahkan di atas angka perangkat.
     * Jalan santai dan berkebun yang dilakukan sambil memakai jam tangan sudah
     * masuk di sana; berenang atau sesi yang jamnya dilepas belum.
     *
     * Terpisah dari calories_burned dengan sengaja. "Kalorinya diisi manual"
     * dan "sesinya terekam jam" adalah dua fakta berbeda: renang bisa diisi
     * manual tanpa jam, jalan kaki bisa terekam jam tanpa user mengetik apa pun.
     * Menyatukan keduanya jadi satu kolom pernah diusulkan dan salah.
     */
    tracked_by_device: z.boolean().optional(),

    notes: z.string().trim().max(1000).optional(),
    logged_at: dateString.optional(),
  })
  .superRefine((data, ctx) => {
    tegakkanUkuran(data, ctx);

    const sumber = [data.workout_library_id, data.custom_workout_id].filter(Boolean);

    if (sumber.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['custom_workout_id'],
        message: 'Pilih salah satu saja: dari library atau dari custom workout',
      });
      return;
    }

    if (
      data.duration_minutes === undefined &&
      data.reps === undefined &&
      data.hold_seconds === undefined
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['duration_minutes'],
        message: 'Isi durasi menit, atau set dan ulangan, atau set dan detik tahan',
      });
    }

    // Input manual: nama dan kalori harus diisi sendiri karena tidak ada
    // sumber yang bisa dirujuk untuk mengisinya.
    if (sumber.length === 0) {
      if (!data.workout_name) {
        ctx.addIssue({
          code: 'custom',
          path: ['workout_name'],
          message: 'Isi nama olahraga, atau pilih dari library / custom workout',
        });
      }
      if (data.calories_burned === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['calories_burned'],
          message: 'Isi kalori terbakar untuk olahraga yang diinput manual',
        });
      }
    }
  });

/**
 * Koreksi log olahraga yang sudah tercatat.
 *
 * Sumbernya (library / custom / manual) tidak bisa diubah, mengganti sumber
 * berarti olahraga yang berbeda, dan itu catatan baru, bukan penyuntingan.
 */
export const UpdateWorkoutSchema = z
  .object({
    workout_name: z.string().trim().min(2, 'Nama olahraga minimal 2 karakter').max(255).optional(),

    duration_minutes: z
      .number({ message: 'Durasi harus berupa angka' })
      .int('Durasi harus bilangan bulat')
      .min(1, 'Durasi minimal 1 menit')
      .max(1440, 'Durasi maksimal 1440 menit')
      .optional(),

    calories_burned: z
      .number({ message: 'Kalori harus berupa angka' })
      .int('Kalori harus bilangan bulat')
      .min(0, 'Kalori tidak boleh negatif')
      .max(20_000, 'Kalori tidak masuk akal')
      .optional(),

    sets: z.number().int().min(1).max(100).optional(),
    reps: z.number().int().min(1).max(1000).optional(),
    hold_seconds: z.number().int().min(1).max(3600).optional(),
    load_kg: z.number().min(0).max(500).nullable().optional(),

    intensity: z.enum(WORKOUT_INTENSITY).optional(),
    tracked_by_device: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    tegakkanUkuran(data, ctx);
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export const CreateCustomWorkoutSchema = z.object({
  name: z.string().trim().min(2, 'Nama olahraga minimal 2 karakter').max(255),
  category: z.enum(WORKOUT_CATEGORY),
  /** Cara diukur, dipilih user saat membuat. Kosong berarti menit. */
  measure: z.enum(WORKOUT_MEASURE).optional(),
  calories_burned_per_minute: z
    .number({ message: 'Kalori per menit harus berupa angka' })
    .min(0.1, 'Kalori per menit minimal 0.1')
    .max(100, 'Kalori per menit maksimal 100')
    // Nilai ini adalah estimasi untuk berat badan 70kg, sama seperti library
    // global. Backend yang men-scale-nya sesuai berat user saat mencatat log.
    .transform((value) => value.toFixed(2)),
  description: z.string().trim().max(1000).optional(),
});

export const LibraryQuerySchema = z.object({
  category: z.enum(WORKOUT_CATEGORY).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CreateWorkoutDto = z.infer<typeof CreateWorkoutSchema>;
export type UpdateWorkoutDto = z.infer<typeof UpdateWorkoutSchema>;
export type CreateCustomWorkoutDto = z.infer<typeof CreateCustomWorkoutSchema>;
export type LibraryQueryDto = z.infer<typeof LibraryQuerySchema>;
