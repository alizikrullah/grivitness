import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type { SleepDay, SleepLog } from '@/types';

export interface SleepInput {
  sleep_start: string;
  sleep_end: string;
  quality_score: number;
  notes?: string;
}

/** Balasannya objek rekap harian, bukan array, lihat catatan di tipe SleepDay. */
export const useSleepToday = () =>
  useQuery({ queryKey: qk.sleepToday, queryFn: () => get<SleepDay>('/api/sleep/today') });

export const useSleepRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.sleepRange(from, to),
    queryFn: () => get<SleepLog[]>('/api/sleep', { params: { from, to } }),
  });

/**
 * Tidur pada satu tanggal, dipakai layar catat untuk menelusuri hari lampau.
 *
 * Untuk hari ini permintaannya dialihkan ke endpoint dan kunci cache "today",
 * supaya layar catat dan beranda berbagi satu salinan data. Tanpa itu hal yang
 * sama tersimpan dua kali dengan kunci berbeda, dan salah satunya pasti basi.
 */
export const useSleepDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.sleepToday : qk.sleepDate(date),
    queryFn: () =>
      iniHariIni
        ? get<SleepDay>('/api/sleep/today')
        : get<SleepDay>('/api/sleep/day', { params: { date } }),
  });
};

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['sleep'] });
  invalidateAfterLog(client);
};

export const useCreateSleep = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: SleepInput) => post<SleepLog>('/api/sleep', body),
    onSuccess: () => segarkan(client),
  });
};

export const useDeleteSleep = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/sleep/' + id),
    onSuccess: () => segarkan(client),
  });
};

export interface SleepEditInput {
  id: string;
  sleep_start?: string;
  sleep_end?: string;
  quality_score?: number;
  /** null berarti catatan dikosongkan, undefined berarti tidak disentuh. */
  notes?: string | null;
}

export const useUpdateSleep = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: SleepEditInput) => patch<SleepLog>('/api/sleep/' + id, body),
    onSuccess: () => segarkan(client),
  });
};
