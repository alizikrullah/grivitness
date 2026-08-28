import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, del, get, patch, unwrap } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type { FoodDay, FoodLog, MealType } from '@/types';

export interface FoodInput {
  /**
   * Berkas asli dari <input type="file">.
   *
   * Berbeda dari mobile, yang mengirim objek { uri, name, type } palsu karena
   * React Native tidak punya File sungguhan. Di browser File adalah Blob yang
   * sah, jadi FormData menerimanya apa adanya tanpa cast apa pun.
   */
  file: File;
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
 * Header untuk unggahan multipart.
 *
 * Content-Type sengaja dikosongkan, BUKAN diisi 'multipart/form-data'. Instance
 * axios di sini memasang 'application/json' sebagai bawaan, jadi tetap harus
 * ditimpa, tapi menimpanya dengan 'multipart/form-data' polos justru merusak
 * permintaannya: nilai itu wajib disertai parameter `boundary` yang cuma bisa
 * dibuat oleh browser. Dengan undefined, browser mengisinya sendiri, lengkap.
 */
export const multipartHeaders = { 'Content-Type': undefined } as const;

export const useCreateFood = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ file, ...rest }: FoodInput) => {
      const form = new FormData();
      form.append('photo', file);

      for (const [kunci, nilai] of Object.entries(rest)) {
        if (nilai !== undefined && nilai !== '') form.append(kunci, String(nilai));
      }

      return unwrap<FoodLog>(api.post('/api/food', form, { headers: multipartHeaders }));
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
 * Analisa AI sering meleset pada hidangan yang mirip, dan tanpa jalur ini satu
 * satunya cara membetulkannya adalah menghapus lalu mencatat dari awal, yang
 * berarti satu panggilan AI lagi hanya untuk memperbaiki satu kata.
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
