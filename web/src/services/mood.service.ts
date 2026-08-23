import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { MoodLog } from '@/types';

export interface MoodInput {
  mood_score: number;
  energy_score: number;
  notes?: string;
  logged_at?: string;
}

export const useMoodToday = () =>
  useQuery({
    queryKey: qk.moodToday,
    queryFn: async () => {
      try {
        return await get<MoodLog | null>('/api/mood/today');
      } catch {
        return null;
      }
    },
  });

export const useMoodRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.moodRange(from, to),
    queryFn: () => get<MoodLog[]>('/api/mood', { params: { from, to } }),
  });

export const useSaveMood = () => {
  const client = useQueryClient();

  /** Satu baris per hari — kalau hari ini sudah ada, yang terjadi pembaruan. */
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & MoodInput) =>
      id ? patch<MoodLog>('/api/mood/' + id, body) : post<MoodLog>('/api/mood', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['mood'] });
      invalidateAfterLog(client);
    },
  });
};

export const useDeleteMood = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/mood/' + id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['mood'] });
      invalidateAfterLog(client);
    },
  });
};
