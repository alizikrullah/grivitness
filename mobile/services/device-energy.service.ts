import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import type { DeviceEnergyLog } from '@/types';
import { todayWIB } from '@/utils/date';

/**
 * Diisi SALAH SATU, tergantung angka apa yang ditampilkan perangkatnya.
 *
 * Banyak jam tangan hanya punya kalori aktif. Untuk itu backend menambahkan BMR
 * user, karena kalori aktif memang mengukur pengeluaran di ATAS istirahat
 * sehingga metabolisme basalnya justru bagian yang belum terhitung.
 */
export interface DeviceEnergyInput {
  /** Kalori total sehari, sudah termasuk metabolisme istirahat. */
  total_kcal?: number;
  /** Kalori aktif saja, tanpa metabolisme istirahat. */
  active_kcal?: number;
  source?: string;
  notes?: string;
  logged_at?: string;
}

/**
 * Kalori keluar harian menurut smartwatch.
 *
 * Angka ini MENGGANTIKAN hitungan TDEE hari itu di backend, tidak ditambahkan
 * ke atasnya. Jam tangan sudah memuat jalan kaki dan kegiatan sehari-hari yang
 * juga dihitung dari step_logs dan activity_level, jadi menjumlahkan keduanya
 * berarti menghitung jam yang sama dua kali.
 */
export const useDeviceEnergyDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.deviceEnergyToday : qk.deviceEnergyDate(date),
    queryFn: async () => {
      try {
        return iniHariIni
          ? await get<DeviceEnergyLog | null>('/api/device-energy/today')
          : await get<DeviceEnergyLog | null>('/api/device-energy/day', { params: { date } });
      } catch {
        return null;
      }
    },
  });
};

export const useDeviceEnergyRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.deviceEnergyRange(from, to),
    queryFn: () => get<DeviceEnergyLog[]>('/api/device-energy', { params: { from, to } }),
  });

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['device-energy'] });
  // Kalori keluar di beranda ikut berubah begitu angka perangkat masuk, jadi
  // ringkasan harian harus ikut disegarkan.
  invalidateAfterLog(client);
};

/**
 * POST-nya bersifat upsert di backend, jadi mencatat ulang tanggal yang sama
 * menimpa angkanya alih-alih ditolak sebagai duplikat. Mengoreksi angka yang
 * salah ambil karena itu tidak perlu menghapus dulu.
 */
export const useSaveDeviceEnergy = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: DeviceEnergyInput) => post<DeviceEnergyLog>('/api/device-energy', body),
    onSuccess: () => segarkan(client),
  });
};

export const useDeleteDeviceEnergy = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/device-energy/' + id),
    onSuccess: () => segarkan(client),
  });
};
