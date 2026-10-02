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
 * Satu makanan seperti yang ditulis user.
 *
 * Nama dan jumlah porsi wajib. Berat per porsi opsional kalau ada foto (model
 * menaksirnya dari foto), WAJIB kalau tidak ada foto. Backend yang menolak
 * kalau aturan itu dilanggar, tapi layar sebaiknya sudah memeriksanya lebih
 * dulu supaya pesannya muncul di kolom yang tepat.
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
  /** Kosong berarti dicatat tanpa foto, dari tulisan saja. */
  uri?: string | null;
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

/**
 * Dua bentuk request untuk satu endpoint.
 *
 * Dengan foto: multipart, dan daftar item dikirim sebagai string JSON di field
 * "items" karena multipart cuma membawa string. Tanpa foto: JSON biasa, daftar
 * item apa adanya. Backend menerima keduanya.
 */
export const useCreateFood = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ uri, items, ...rest }: FoodInput) => {
      if (!uri) {
        return unwrap<FoodLog>(api.post('/api/food', { ...rest, items }));
      }

      const form = new FormData();
      form.append('photo', asFilePart(uri));
      form.append('items', JSON.stringify(items));

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
   * Boleh lebih pendek (item dihapus), tidak boleh lebih panjang: makanan baru
   * butuh taksiran gizi baru, dan itu sesi makan baru.
   */
  items?: FoodItemEditInput[];
  /** Tombol Abaikan pada tanda "foto terlihat berbeda". */
  dismiss_photo_note?: true;
}

/**
 * Mengoreksi sesi makan tanpa memanggil AI lagi.
 *
 * Nilai gizi per 100 tiap item sudah tersimpan dari analisa pertama, jadi
 * mengubah nama, jumlah porsi, atau berat cukup dihitung ulang backend.
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
