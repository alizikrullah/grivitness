import { dateRangeFilter } from '../utils/query.js';
import { forUser } from './scoped.js';

/**
 * Tanggal yang ditandai user "belum lengkap" catatan makannya, dalam satu
 * rentang.
 *
 * Satu tempat untuk aturan "hari belum lengkap tidak dihitung", karena aturan
 * itu harus sama persis di semua yang merata-ratakan kalori masuk: riwayat
 * kalori, rekap mingguan dan bulanan, chat, dan TDEE terukur. Kalau satu saja
 * lupa, dua layar menyebut dua rata-rata berbeda untuk minggu yang sama.
 *
 * Separuh catatan bukan separuh makan. Nol kalori yang lupa dicatat terbaca
 * sebagai defisit, dan itu arah kesalahan yang paling berbahaya untuk
 * aplikasi penurunan berat badan.
 */
export const hariBelumLengkap = async (
  userId: string,
  range: { from: string; to: string },
): Promise<Set<string>> => {
  const baris = await forUser(userId).list('food_day_status', {
    filter: { ...dateRangeFilter(range), status: { _eq: 'INCOMPLETE' } },
    fields: ['logged_at'],
    limit: -1,
  });
  return new Set(baris.map((b) => b.logged_at));
};
