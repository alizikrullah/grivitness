import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { patch } from '@/lib/api';

/**
 * Mendaftarkan perangkat ini untuk menerima pengingat.
 *
 * Tanpa langkah ini, sakelar pengingat di layar profil hanya mengubah baris di
 * database dan tidak pernah menghasilkan notifikasi — backend tidak punya
 * alamat yang bisa dituju. Token Expo itulah alamatnya.
 *
 * Semua kegagalan di sini ditelan diam-diam. Notifikasi adalah pelengkap, dan
 * tidak boleh ada satu pun jalur di sini yang bisa menahan aplikasi terbuka.
 */
const ambilToken = async (): Promise<string | null> => {
  // Emulator dan simulator tidak bisa menerima push sama sekali.
  if (!Device.isDevice) return null;

  const { status } = await Notifications.getPermissionsAsync();

  const izin =
    status === 'granted' ? status : (await Notifications.requestPermissionsAsync()).status;

  if (izin !== 'granted') return null;

  if (Platform.OS === 'android') {
    // Android menolak menampilkan notifikasi yang tidak punya channel.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Pengingat GriviTness',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F2333F',
    });
  }

  // projectId hanya ada setelah proyek terhubung ke EAS. Sebelum itu token
  // tidak bisa diterbitkan, dan itu bukan kesalahan — hanya belum saatnya.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (typeof projectId !== 'string') return null;

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
};

export const usePushToken = (aktif: boolean): void => {
  useEffect(() => {
    if (!aktif) return;

    let batal = false;

    const daftar = async () => {
      try {
        const token = await ambilToken();
        if (!token || batal) return;

        await patch('/api/notifications/settings', { expo_push_token: token });
      } catch {
        // Perangkat tidak mendukung, izin ditolak, atau server sedang bermasalah.
        // Aplikasi tetap berjalan penuh tanpa pengingat.
      }
    };

    void daftar();

    return () => {
      batal = true;
    };
  }, [aktif]);
};
