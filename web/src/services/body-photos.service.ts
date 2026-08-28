import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, del, get, unwrap } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type { BodyPhoto } from '@/types';
import { multipartHeaders } from './food.service';

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

/**
 * Foto badan pada satu tanggal. Hari ini dialihkan ke kunci cache "today"
 * supaya tidak ada dua salinan data yang sama dengan kunci berbeda.
 */
export const useBodyPhotoDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.bodyPhotoToday : qk.bodyPhotoDate(date),
    queryFn: async () => {
      try {
        return iniHariIni
          ? await get<BodyPhoto | null>('/api/body-photos/today')
          : await get<BodyPhoto | null>('/api/body-photos/day', { params: { date } });
      } catch {
        return null;
      }
    },
  });
};

export const useCreateBodyPhoto = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      front,
      side,
      logged_at,
    }: {
      front: File;
      side: File;
      /** Dikosongkan berarti hari ini. Diisi saat mencatat ke hari lampau. */
      logged_at?: string;
    }) => {
      const form = new FormData();
      form.append('front_photo', front);
      form.append('side_photo', side);
      if (logged_at) form.append('logged_at', logged_at);

      return unwrap<BodyPhoto>(
        api.post('/api/body-photos', form, {
          headers: multipartHeaders,
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
