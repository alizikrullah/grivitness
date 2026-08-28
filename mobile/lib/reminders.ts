import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { NotificationSettings } from '@/types';

/**
 * Penjadwalan pengingat DI PERANGKAT, bukan lewat push dari server.
 *
 * Semua pengingat di aplikasi ini berbasis jam: timbang jam sekian, minum tiap
 * sekian jam. Jadwal seperti itu tidak butuh server sama sekali, sistem operasi
 * bisa menyimpannya sendiri. Konsekuensinya pengingat tetap muncul walau HP
 * sedang offline, dan tidak ada satu pun bagian infrastruktur yang bisa mati
 * dan membuatnya berhenti.
 *
 * Push dari server baru diperlukan kalau isinya bergantung pada data yang cuma
 * ada di server, misalnya "berat kamu turun 2 kg bulan ini".
 */

/** Expo Go tidak membawa expo-notifications untuk Android sejak SDK 53. */
const DI_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const CHANNEL_ID = 'pengingat';

/** Jam pengingat disimpan dalam WIB, tapi OS menjadwalkan menurut jam perangkat. */
const WIB_OFFSET_MENIT = 7 * 60;

/**
 * Mengubah jam WIB "HH:mm" menjadi jam dan menit di zona waktu perangkat.
 *
 * Untuk user yang memang berada di WIB hasilnya sama persis. Yang ditolong
 * adalah user yang sedang di luar negeri: pengingat "timbang jam 07:00" tetap
 * berbunyi pada jam yang sama menurut hari yang dipakai backend, bukan bergeser
 * mengikuti zona waktu setempat.
 */
const wibKeJamPerangkat = (jamWib: string): { hour: number; minute: number } => {
  const jam = Number(jamWib.slice(0, 2));
  const menit = Number(jamWib.slice(3, 5));

  if (!Number.isFinite(jam) || !Number.isFinite(menit)) return { hour: 7, minute: 0 };

  const menitUtc = jam * 60 + menit - WIB_OFFSET_MENIT;

  // getTimezoneOffset() adalah menit yang harus DITAMBAHKAN ke waktu lokal untuk
  // mendapat UTC, jadi arahnya dibalik di sini.
  const menitLokal = menitUtc - new Date().getTimezoneOffset();

  // Hasilnya bisa melewati tengah malam ke salah satu arah, jadi dinormalkan
  // kembali ke rentang satu hari.
  const normal = ((menitLokal % 1440) + 1440) % 1440;

  return { hour: Math.floor(normal / 60), minute: normal % 60 };
};

/** Batas jam pengingat minum, supaya tidak membangunkan orang dini hari. */
const MINUM_MULAI_JAM = 7;
const MINUM_SELESAI_JAM = 21;

interface Pengingat {
  jamWib: string;
  title: string;
  body: string;
}

const daftarPengingat = (s: NotificationSettings): Pengingat[] => {
  const hasil: Pengingat[] = [];

  if (s.weight_reminder_enabled) {
    hasil.push({
      jamWib: s.weight_reminder_time,
      title: 'Waktunya menimbang',
      body: 'Catat berat badanmu hari ini biar trennya tetap kebaca.',
    });
  }

  if (s.workout_reminder_enabled) {
    hasil.push({
      jamWib: s.workout_reminder_time,
      title: 'Jadwal olahraga',
      body: 'Gerak dulu yuk, sebentar saja tetap dihitung.',
    });
  }

  if (s.photo_reminder_enabled) {
    hasil.push({
      jamWib: s.photo_reminder_time,
      title: 'Foto progres',
      body: 'Ambil foto badan hari ini untuk dibandingkan nanti.',
    });
  }

  if (s.water_reminder_enabled) {
    // Interval diterjemahkan jadi beberapa jadwal harian tetap, bukan satu
    // pengulangan tiap N jam. Pengulangan bebas akan terus berjalan sepanjang
    // malam dan berbunyi jam tiga pagi.
    const jarak = Math.max(1, s.water_reminder_interval_hours);

    for (let jam = MINUM_MULAI_JAM; jam <= MINUM_SELESAI_JAM; jam += jarak) {
      hasil.push({
        jamWib: String(jam).padStart(2, '0') + ':00',
        title: 'Minum dulu',
        body: 'Sudah waktunya minum air. Catat setelah minum ya.',
      });
    }
  }

  return hasil;
};

/**
 * Menyusun ulang seluruh jadwal pengingat sesuai pengaturan terbaru.
 *
 * Seluruh jadwal lama dihapus lebih dulu. Menambah tanpa membersihkan membuat
 * jadwal menumpuk setiap kali pengaturan disentuh, dan user akan menerima
 * notifikasi yang sama berkali-kali tanpa tahu sebabnya.
 *
 * Mengembalikan jumlah pengingat yang berhasil dijadwalkan, atau null kalau
 * penjadwalan memang tidak bisa dilakukan di lingkungan ini.
 */
export const susunUlangPengingat = async (
  settings: NotificationSettings,
): Promise<number | null> => {
  if (DI_EXPO_GO) return null;

  // Ditunda sampai di sini. Impor statis akan dievaluasi saat berkas dimuat,
  // dan di Expo Go evaluasi itu melempar error yang menjatuhkan aplikasi.
  const N = await import('expo-notifications');

  const { status } = await N.getPermissionsAsync();
  const izin = status === 'granted' ? status : (await N.requestPermissionsAsync()).status;

  if (izin !== 'granted') return null;

  if (Platform.OS === 'android') {
    // Android menolak menampilkan notifikasi yang tidak punya channel.
    await N.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Pengingat GriviTness',
      importance: N.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F2333F',
    });
  }

  await N.cancelAllScheduledNotificationsAsync();

  const daftar = daftarPengingat(settings);

  for (const pengingat of daftar) {
    const { hour, minute } = wibKeJamPerangkat(pengingat.jamWib);

    await N.scheduleNotificationAsync({
      content: { title: pengingat.title, body: pengingat.body, sound: true },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
        channelId: CHANNEL_ID,
        hour,
        minute,
      },
    });
  }

  return daftar.length;
};

/** Membatalkan seluruh pengingat, dipakai saat user keluar dari akun. */
export const hapusSemuaPengingat = async (): Promise<void> => {
  if (DI_EXPO_GO) return;

  const N = await import('expo-notifications');
  await N.cancelAllScheduledNotificationsAsync();
};

/** Apakah penjadwalan bisa dilakukan di lingkungan yang sedang berjalan. */
export const pengingatDidukung = (): boolean => !DI_EXPO_GO;
