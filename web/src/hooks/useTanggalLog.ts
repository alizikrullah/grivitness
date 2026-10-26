import { useSearchParams } from 'react-router-dom';

import { todayWIB } from '@/utils/date';

const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tanggal halaman Catat, disimpan di alamat: `/log/food?date=2026-10-22`.
 *
 * Header halaman Catat dan panel di sebelahnya membaca tanggal yang SAMA, jadi
 * memilih hari yang terlewat di strip pekan langsung membuka panel di hari
 * itu, dan menggeser tanggal di panel ikut menggeser headernya. Disimpan di
 * alamat, bukan state, supaya pindah jenis catatan tidak mengembalikannya ke
 * hari ini. Padanan useTanggalAwal di mobile.
 *
 * `maxDate` bawaan hari ini; panel tidur memakai sleepDayNow(). Isi yang tidak
 * sah atau melewati batas dianggap hari ini.
 */
export const useTanggalLog = (maxDate?: string): [string, (tanggal: string) => void] => {
  const [params, setParams] = useSearchParams();
  const hariIni = todayWIB();
  const batas = maxDate ?? hariIni;
  const mentah = params.get('date');
  const tanggal =
    mentah !== null && FORMAT_TANGGAL.test(mentah) && mentah <= batas ? mentah : hariIni;

  const ubah = (baru: string) => {
    setParams(
      (lama) => {
        const p = new URLSearchParams(lama);
        // Hari ini tidak ditulis, supaya alamat biasa tetap /log/food.
        if (baru === todayWIB()) p.delete('date');
        else p.set('date', baru);
        return p;
      },
      // Menggeser tanggal bukan pindah halaman: tombol kembali browser tidak
      // perlu melangkah mundur sehari demi sehari.
      { replace: true },
    );
  };

  return [tanggal, ubah];
};
