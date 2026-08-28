import { z } from 'zod';

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus berformat YYYY-MM-DD')
  .refine((value) => !Number.isNaN(new Date(value).getTime()), 'Tanggal tidak valid');

export const CreateGoalSchema = z.object({
  target_weight_kg: z
    .number({ message: 'Target berat harus berupa angka' })
    .min(20, 'Target berat minimal 20 kg')
    .max(400, 'Target berat maksimal 400 kg')
    .transform((value) => value.toFixed(2)),

  target_date: dateString,

  /**
   * Opsional. Kalau dikosongkan, backend menghitungnya dari TDEE dan selisih
   * berat menuju target. Kalau diisi, nilai dari user yang dipakai, dia berhak
   * menentukan sendiri, misalnya karena mengikuti anjuran dokter atau pelatih.
   */
  daily_calorie_budget: z
    .number({ message: 'Budget kalori harus berupa angka' })
    .int('Budget kalori harus bilangan bulat')
    .min(800, 'Budget kalori minimal 800 kkal')
    .max(10000, 'Budget kalori maksimal 10000 kkal')
    .optional(),
});

export const UpdateGoalSchema = z
  .object({
    target_weight_kg: CreateGoalSchema.shape.target_weight_kg.optional(),
    target_date: dateString.optional(),
    daily_calorie_budget: CreateGoalSchema.shape.daily_calorie_budget,
    is_active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Tidak ada field yang diubah',
  });

export const GoalIdSchema = z.object({
  id: z.uuid({ message: 'Id goal tidak valid' }),
});

export type CreateGoalDto = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalDto = z.infer<typeof UpdateGoalSchema>;
export type GoalIdDto = z.infer<typeof GoalIdSchema>;
