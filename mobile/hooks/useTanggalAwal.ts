import { useLocalSearchParams } from 'expo-router';

import { todayWIB } from '@/utils/date';

const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tanggal awal sebuah layar catat.
 *
 * Kalau layar dibuka dari halaman Catat yang sedang menampilkan tanggal lain
 * (misalnya hari yang terlewat karena sakit), tanggal itu ikut lewat parameter
 * `date`, jadi user tidak perlu menggeser tanggal lagi. Tanpa parameter, atau
 * kalau isinya tidak sah atau belum terjadi, layar mulai di hari ini.
 */
export const useTanggalAwal = (): string => {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const hariIni = todayWIB();

  return typeof date === 'string' && FORMAT_TANGGAL.test(date) && date <= hariIni ? date : hariIni;
};
