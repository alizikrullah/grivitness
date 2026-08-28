import { z } from 'zod';

import { dateString } from '../../utils/query.js';

const steps = z
  .number({ message: 'Jumlah langkah harus berupa angka' })
  .int('Jumlah langkah harus bilangan bulat')
  .min(0, 'Jumlah langkah tidak boleh negatif')
  .max(200_000, 'Jumlah langkah tidak masuk akal');

export const CreateStepsSchema = z.object({
  steps,
  logged_at: dateString.optional(),
});

export const UpdateStepsSchema = z.object({
  // Hanya `steps` yang bisa diubah. distance_km dan calories_burned adalah
  // turunan yang dihitung backend, membiarkan client mengirimnya berarti
  // angka di database bisa tidak konsisten dengan jumlah langkahnya.
  steps,
});

export type CreateStepsDto = z.infer<typeof CreateStepsSchema>;
export type UpdateStepsDto = z.infer<typeof UpdateStepsSchema>;
