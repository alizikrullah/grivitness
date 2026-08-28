import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
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

/**
 * Langkah pada satu tanggal, dipakai layar catat untuk menelusuri hari lampau.
 *
 * Untuk hari ini permintaannya dialihkan ke endpoint dan kunci cache "today",
 * supaya layar catat dan beranda berbagi satu salinan data. Tanpa itu hal yang
 * sama tersimpan dua kali dengan kunci berbeda, dan salah satunya pasti basi.
 */
export const useStepsDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.stepsToday : qk.stepsDate(date),
    queryFn: async () => {
      try {
        return iniHariIni
          ? await get<StepLog | null>('/api/steps/today')
          : await get<StepLog | null>('/api/steps/day', { params: { date } });
      } catch {
        return null;
      }
    },
  });
};

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['steps'] });
  invalidateAfterLog(client);
};

export const useSaveSteps = () => {
  const client = useQueryClient();

  /**
   * Satu baris langkah per hari, jadi mencatat ulang di hari yang sama harus
   * memperbarui, bukan membuat baris baru yang akan ditolak DUPLICATE_ENTRY.
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

export const useDeleteSteps = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/steps/' + id),
    onSuccess: () => segarkan(client),
  });
};
