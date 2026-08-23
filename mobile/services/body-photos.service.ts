import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, del, get, unwrap } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { BodyPhoto } from '@/types';
import { asFilePart } from './food.service';

export const useBodyPhotoToday = () =>
  useQuery({
    queryKey: qk.bodyPhotoToday,
    queryFn: async () => {
      try {
        return await get<BodyPhoto | null>('/api/body-photos/today');
      } catch {
        return null;
      }
    },
  });

export const useBodyPhotoRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.bodyPhotoRange(from, to),
    queryFn: () => get<BodyPhoto[]>('/api/body-photos', { params: { from, to } }),
  });

export const useCreateBodyPhoto = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ front, side }: { front: string; side: string }) => {
      const form = new FormData();
      form.append('front_photo', asFilePart(front));
      form.append('side_photo', asFilePart(side));

      return unwrap<BodyPhoto>(
        api.post('/api/body-photos', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          // Dua gambar sekaligus lewat analisa Groq. Ini permintaan terlama di
          // seluruh aplikasi, jadi batas waktunya dilonggarkan khusus di sini.
          timeout: 180_000,
        }),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['body-photos'] });
      invalidateAfterLog(client);
    },
  });
};

export const useDeleteBodyPhoto = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/body-photos/' + id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['body-photos'] });
      invalidateAfterLog(client);
    },
  });
};
