import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { BodyMeasurement } from '@/types';

/**
 * Cuma lingkar pinggang, dicatat 2-4 minggu sekali bersama foto badan.
 *
 * Dulu ada tujuh lingkar dan itu yang membuat fiturnya mengganggu: tujuh kolom
 * kosong yang terasa seperti PR harian, untuk angka yang tidak dipakai
 * hitungan mana pun. Backend meng-upsert per tanggal, jadi mengukur ulang di
 * hari yang sama tinggal kirim lagi.
 */
export interface MeasurementInput {
  waist_cm: number;
  logged_at?: string;
}

export const useLatestMeasurement = () =>
  useQuery({
    queryKey: qk.measurementsLatest,
    queryFn: async () => {
      try {
        return await get<BodyMeasurement | null>('/api/measurements/latest');
      } catch {
        return null;
      }
    },
  });

export const useMeasurementRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.measurementsRange(from, to),
    queryFn: () => get<BodyMeasurement[]>('/api/measurements', { params: { from, to } }),
  });

/**
 * Pengukuran pada satu tanggal.
 *
 * Tidak punya jalan pintas "hari ini" seperti modul lain, karena endpoint
 * ringkasnya adalah pengukuran TERAKHIR, yang belum tentu jatuh pada hari ini.
 */
export const useMeasurementDate = (date: string) =>
  useQuery({
    queryKey: qk.measurementsDate(date),
    queryFn: async () => {
      try {
        return await get<BodyMeasurement | null>('/api/measurements/day', { params: { date } });
      } catch {
        return null;
      }
    },
  });

export const useSaveMeasurement = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: MeasurementInput) => post<BodyMeasurement>('/api/measurements', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['measurements'] });
      // Pinggang ikut tampil di perbandingan foto badan.
      void client.invalidateQueries({ queryKey: ['body-photos', 'compare'] });
      invalidateAfterLog(client);
    },
  });
};

export const useDeleteMeasurement = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/measurements/' + id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['measurements'] });
      void client.invalidateQueries({ queryKey: ['body-photos', 'compare'] });
      invalidateAfterLog(client);
    },
  });
};
