import { useEffect } from 'react';

import { susunUlangPengingat } from '@/lib/reminders';
import type { NotificationSettings } from '@/types';

/**
 * Menyusun ulang jadwal pengingat di perangkat setiap kali pengaturannya berubah.
 *
 * Dipasang di layar profil, bukan di root layout. Pengaturan hanya bisa diubah
 * dari sana, jadi tidak ada gunanya ikut berjalan di setiap layar — dan meminta
 * izin notifikasi saat user baru membuka beranda akan terasa memaksa.
 *
 * `settings` aman dipakai sebagai dependency apa adanya. TanStack Query
 * menerapkan structural sharing, jadi hasil pengambilan ulang yang isinya sama
 * mengembalikan referensi objek yang sama juga — efek ini tidak akan membongkar
 * dan menyusun ulang jadwal setiap kali query menyegarkan dirinya.
 */
export const useReminderScheduler = (settings: NotificationSettings | undefined): void => {
  useEffect(() => {
    if (!settings) return;

    void susunUlangPengingat(settings);
  }, [settings]);
};
