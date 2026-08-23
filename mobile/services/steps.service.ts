import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { StepLog } from '@/types';

export const useStepsToday = () =>
  useQuery({
    queryKey: qk.stepsToday,
    queryFn: async () => {
      try {
        return await get<StepLog | null>('/api/steps/today');
      } catch {
        return null;
      }
    },
  });

export const useStepsRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.stepsRange(from, to),
    queryFn: () => get<StepLog[]>('/api/steps', { params: { from, to } }),
  });

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['steps'] });
  invalidateAfterLog(client);
};

export const useSaveSteps = () => {
  const client = useQueryClient();

  /**
   * Satu baris langkah per hari, jadi mencatat ulang di hari yang sama harus
   * memperbarui — bukan membuat baris baru yang akan ditolak DUPLICATE_ENTRY.
   * Id log hari ini dikirim pemanggil kalau memang sudah ada.
   */
  return useMutation({
    mutationFn: ({ id, steps, logged_at }: { id?: string; steps: number; logged_at?: string }) =>
      id
        ? patch<StepLog>('/api/steps/' + id, { steps })
        : post<StepLog>('/api/steps', { steps, logged_at }),
    onSuccess: () => segarkan(client),
  });
};
