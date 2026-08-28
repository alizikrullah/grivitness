import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type { WaterDay, WaterLog } from '@/types';

export const useWaterToday = () =>
  useQuery({ queryKey: qk.waterToday, queryFn: () => get<WaterDay>('/api/water/today') });

/**
 * Minum pada satu tanggal. Hari ini dialihkan ke endpoint dan kunci cache
 * "today" supaya layar catat dan beranda berbagi satu salinan data.
 */
export const useWaterDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.waterToday : qk.waterDate(date),
    queryFn: () =>
      iniHariIni
        ? get<WaterDay>('/api/water/today')
        : get<WaterDay>('/api/water', { params: { date } }),
  });
};

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['water'] });
  invalidateAfterLog(client);
};

export const useAddWater = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { amount_ml: number; logged_at?: string }) =>
      post<WaterLog>('/api/water', body),
    onSuccess: () => segarkan(client),
  });
};

export const useDeleteWater = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/water/' + id),
    onSuccess: () => segarkan(client),
  });
};

export const useUpdateWater = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; amount_ml?: number; logged_at?: string }) =>
      patch<WaterLog>('/api/water/' + id, body),
    onSuccess: () => segarkan(client),
  });
};
