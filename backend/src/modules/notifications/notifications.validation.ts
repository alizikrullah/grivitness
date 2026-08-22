import { z } from 'zod';

/** Format jam "HH:mm" dalam timezone WIB. */
const jam = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Waktu harus berformat HH:mm, contoh "21:00"');

export const UpdateNotificationSettingsSchema = z
  .object({
    /**
     * Diisi client setelah user memberi izin notifikasi. Boleh null supaya
     * client bisa mencabutnya saat user menolak izin atau logout.
     */
    expo_push_token: z.string().trim().min(1).max(255).nullable().optional(),

    weight_reminder_enabled: z.boolean().optional(),
    weight_reminder_time: jam.optional(),

    water_reminder_enabled: z.boolean().optional(),
    water_reminder_interval_hours: z
      .number({ message: 'Interval harus berupa angka' })
      .int('Interval harus bilangan bulat')
      .min(1, 'Interval minimal 1 jam')
      .max(12, 'Interval maksimal 12 jam')
      .optional(),

    workout_reminder_enabled: z.boolean().optional(),
    workout_reminder_time: jam.optional(),

    photo_reminder_enabled: z.boolean().optional(),
    photo_reminder_time: jam.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export type UpdateNotificationSettingsDto = z.infer<typeof UpdateNotificationSettingsSchema>;
