import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { BodyMeasurement } from '@/types';

/** Semua bagian opsional — user boleh mencatat pinggang saja. */
export interface MeasurementInput {
  waist_cm?: number;
  hips_cm?: number;
  chest_cm?: number;
  left_arm_cm?: number;
  right_arm_cm?: number;
  left_thigh_cm?: number;
  right_thigh_cm?: number;
  logged_at?: string;
}

/** Bagian badan yang bisa dicatat, beserta namanya untuk ditampilkan. */
export const MEASUREMENT_PARTS = [
  { key: 'chest_cm', label: 'Dada' },
  { key: 'waist_cm', label: 'Pinggang' },
  { key: 'hips_cm', label: 'Pinggul' },
  { key: 'left_arm_cm', label: 'Lengan kiri' },
  { key: 'right_arm_cm', label: 'Lengan kanan' },
  { key: 'left_thigh_cm', label: 'Paha kiri' },
  { key: 'right_thigh_cm', label: 'Paha kanan' },
] as const;

export type MeasurementKey = (typeof MEASUREMENT_PARTS)[number]['key'];

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

export const useSaveMeasurement = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & MeasurementInput) =>
      id
        ? patch<BodyMeasurement>('/api/measurements/' + id, body)
        : post<BodyMeasurement>('/api/measurements', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['measurements'] });
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
      invalidateAfterLog(client);
    },
  });
};
