import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, del, get, patch, unwrap } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type { FoodDay, FoodLog, MealType } from '@/types';

export interface FoodInput {
  uri: string;
  meal_type: MealType;
  notes?: string;
  /** Timestamp ISO. Dikosongkan berarti sekarang. Diisi saat mencatat ke hari lampau. */
  logged_at?: string;
  /** Koreksi manual atas hasil AI. Dikosongkan berarti angka AI yang dipakai. */
  total_calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

export const useFoodToday = () =>
  useQuery({ queryKey: qk.foodToday, queryFn: () => get<FoodDay>('/api/food/today') });

/**
 * Makanan pada satu tanggal. Hari ini dialihkan ke endpoint dan kunci cache
 * "today" supaya layar catat dan beranda berbagi satu salinan data.
 */
export const useFoodDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.foodToday : qk.foodDate(date),
    queryFn: () =>
      iniHariIni
        ? get<FoodDay>('/api/food/today')
        : get<FoodDay>('/api/food', { params: { date } }),
  });
};

/**
 * Nama berkas dari uri kamera atau galeri.
 *
 * Multer memakai nama ini apa adanya, dan Sharp di backend membaca isinya, bukan
 * ekstensinya, jadi salah tebak ekstensi tidak merusak apa pun. Yang
 * penting namanya ada, karena beberapa server menolak bagian tanpa filename.
 */
const namaBerkas = (uri: string): string => {
  const potong = uri.split('/').pop();
  return potong && potong.includes('.') ? potong : 'foto.jpg';
};

const tipeBerkas = (nama: string): string => {
  const ext = nama.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
};

export const asFilePart = (uri: string) => {
  const name = namaBerkas(uri);
  // React Native menerima bentuk objek ini di FormData walaupun tipenya tidak
  // cocok dengan Blob dari DOM. Cast-nya karena itu memang perlu.
  return { uri, name, type: tipeBerkas(name) } as unknown as Blob;
};

export const useCreateFood = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ uri, ...rest }: FoodInput) => {
      const form = new FormData();
      form.append('photo', asFilePart(uri));

      for (const [kunci, nilai] of Object.entries(rest)) {
        if (nilai !== undefined && nilai !== '') form.append(kunci, String(nilai));
      }

      return unwrap<FoodLog>(
        api.post('/api/food', form, { headers: { 'Content-Type': 'multipart/form-data' } }),
      );
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['food'] });
      invalidateAfterLog(client);
    },
  });
};

export interface FoodEditInput {
  id: string;
  meal_type?: MealType;
  notes?: string | null;
  /** Daftar makanan hasil AI yang sudah dibetulkan user. */
  foods_detected?: string[];
  total_calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
}

/**
 * Mengoreksi log makanan tanpa memotret ulang.
 *
 * Analisa AI sering meleset pada hidangan yang mirip, dan sebelum ini satu
 * satunya jalan keluar adalah menghapus lalu mencatat dari awal, yang berarti
 * satu panggilan AI lagi hanya untuk membetulkan satu kata.
 */
export const useUpdateFood = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: FoodEditInput) => patch<FoodLog>('/api/food/' + id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['food'] });
      invalidateAfterLog(client);
    },
  });
};

export const useDeleteFood = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/food/' + id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['food'] });
      invalidateAfterLog(client);
    },
  });
};
