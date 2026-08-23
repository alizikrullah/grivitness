import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { WeightLog } from '@/types';

export interface WeightInput {
  weight_kg: number;
  logged_at?: string;
  notes?: string;
}

/** Balasan null berarti hari ini memang belum ditimbang. */
export const useWeightToday = () =>
  useQuery({
    queryKey: qk.weightToday,
    queryFn: async () => {
      try {
        return await get<WeightLog | null>('/api/weight/today');
      } catch {
        return null;
      }
    },
  });

export const useWeightRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.weightRange(from, to),
    queryFn: () => get<WeightLog[]>('/api/weight', { params: { from, to } }),
  });

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['weight'] });
  invalidateAfterLog(client);
};

export const useCreateWeight = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: WeightInput) => post<WeightLog>('/api/weight', body),
    onSuccess: () => segarkan(client),
  });
};

export const useUpdateWeight = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<WeightInput>) =>
      patch<WeightLog>('/api/weight/' + id, body),
    onSuccess: () => segarkan(client),
  });
};
