import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, del, get, patch, post, put, unwrap } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type {
  FoodDay,
  FoodDayStatus,
  FoodLabel,
  FoodLog,
  FoodSuggestion,
  FoodUnit,
  MealType,
} from '@/types';

/**
 * Satu makanan seperti yang ditulis user. Salinan dari mobile.
 *
 * Nama dan jumlah porsi wajib. Berat per porsi opsional kalau ada foto (model
 * menaksirnya dari foto), WAJIB kalau tidak ada foto.
 */
export interface FoodItemInput {
  name: string;
  portions: number;
  /** Berat atau volume SATU porsi, dalam `unit`. */
  weight?: number;
  unit: FoodUnit;
  /** Nilai gizi satu porsi dari kemasan. Ada berarti model tidak menaksir gizi item ini. */
  label?: FoodLabel;
  /**
   * true kalau item ini dipilih dari saran "Dari catatanmu". HANYA ini yang
   * membuat backend memakai angka catatan sebelumnya; nama yang diketik sama
   * persis tetap ditaksir dari nol. Dicabut begitu nama atau satuannya diubah.
   */
  from_memory?: boolean;
}

export interface FoodInput {
  /**
   * Berkas asli dari <input type="file">, atau null kalau dicatat tanpa foto.
   *
   * Berbeda dari mobile, yang mengirim objek { uri, name, type } palsu karena
   * React Native tidak punya File sungguhan. Di browser File adalah Blob yang
   * sah, jadi FormData menerimanya apa adanya tanpa cast apa pun.
   */
  file: File | null;
  meal_type: MealType;
  items: FoodItemInput[];
  /** Timestamp ISO. Dikosongkan berarti sekarang. Diisi saat mencatat ke hari lampau. */
  logged_at?: string;
}

/**
 * Saran nama dari catatan user sendiri. Kosong berarti yang paling sering.
 * Memilih satu saran mengisi nama, satuan, berat, dan kemasannya sekaligus,
 * dan backend memakai angka yang sama dengan terakhir kali (ingatan makanan).
 */
export const useFoodSuggestions = (q: string) =>
  useQuery({
    queryKey: qk.foodSuggestions(q),
    queryFn: () => get<FoodSuggestion[]>('/api/food/suggestions', { params: { q } }),
    staleTime: 60_000,
  });

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
    // Dengan foto: multipart, daftar item sebagai string JSON. Tanpa foto:
    // JSON biasa. Backend menerima keduanya di satu endpoint.
    mutationFn: ({ file, items, ...rest }: FoodInput) => {
      if (!file) {
        return unwrap<FoodLog>(api.post('/api/food', { ...rest, items }));
      }

      const form = new FormData();
      form.append('photo', file);
      form.append('items', JSON.stringify(items));

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

/**
 * Item saat dikoreksi. Berat kosong berarti berat tersimpan yang dipakai.
 * source_index menunjuk item tersimpan yang dikoreksi, supaya menghapus item
 * di tengah tidak membuat item sesudahnya mewarisi gizi yang salah. Nama atau
 * satuan yang diganti membuat item ITU ditaksir ulang sebagai makanan lain.
 */
export interface FoodItemEditInput extends FoodItemInput {
  source_index?: number;
}

export interface FoodEditInput {
  id: string;
  meal_type?: MealType;
  /**
   * Daftar item yang sudah dibetulkan, urutannya sama dengan yang tersimpan.
   * Boleh lebih pendek (item dihapus), tidak boleh lebih panjang.
   */
  items?: FoodItemEditInput[];
  /** Tombol Abaikan pada tanda "foto terlihat berbeda". */
  dismiss_photo_note?: true;
}

/**
 * Mengoreksi sesi makan tanpa memanggil AI lagi. Nilai gizi per 100 tiap
 * item sudah tersimpan, backend tinggal menghitung ulang.
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

/**
 * Tekan lama chip saran, Lupakan: nama itu hilang dari saran dan catatan
 * lamanya berhenti jadi sumber ingatan. Catatan baru membangun dari nol.
 */
export const useForgetSuggestion = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { name: string; unit: FoodUnit }) =>
      post<{ forgotten: true }>('/api/food/suggestions/forget', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['food', 'suggestions'] });
    },
  });
};

/**
 * Jawaban "belum lengkap" atau "memang segini" untuk hari yang makannya di
 * bawah separuh jatah. Hari belum lengkap tidak ikut rata-rata mana pun.
 */
export const useSetFoodDayStatus = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: { date: string; status: FoodDayStatus }) =>
      put<unknown>('/api/food/day-status', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['food'] });
      void client.invalidateQueries({ queryKey: ['summary'] });
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
