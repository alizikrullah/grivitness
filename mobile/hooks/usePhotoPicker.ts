import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

/**
 * Mengambil foto dari kamera atau galeri.
 *
 * Kualitas ditahan di 0.85 dan bukan 1. Backend tetap mengonversinya ke WebP
 * kualitas 100, jadi selisih detailnya tidak sampai ke penyimpanan, yang
 * berkurang cuma ukuran unggahan, dan itu langsung terasa di koneksi seluler.
 */
const OPSI: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
  allowsEditing: false,
  exif: false,
};

export const usePhotoPicker = () => {
  const [sibuk, setSibuk] = useState(false);

  const jalankan = useCallback(
    async (
      minta: () => Promise<ImagePicker.PermissionResponse>,
      buka: () => Promise<ImagePicker.ImagePickerResult>,
      pesanIzin: string,
    ): Promise<string | null> => {
      setSibuk(true);

      try {
        const izin = await minta();

        if (!izin.granted) {
          Alert.alert('Izin diperlukan', pesanIzin);
          return null;
        }

        const hasil = await buka();
        if (hasil.canceled) return null;

        return hasil.assets[0]?.uri ?? null;
      } finally {
        setSibuk(false);
      }
    },
    [],
  );

  const dariKamera = useCallback(
    () =>
      jalankan(
        ImagePicker.requestCameraPermissionsAsync,
        () => ImagePicker.launchCameraAsync(OPSI),
        'GriviTness butuh izin kamera untuk memotret. Aktifkan di pengaturan perangkat.',
      ),
    [jalankan],
  );

  const dariGaleri = useCallback(
    () =>
      jalankan(
        ImagePicker.requestMediaLibraryPermissionsAsync,
        () => ImagePicker.launchImageLibraryAsync(OPSI),
        'GriviTness butuh izin galeri untuk memilih foto. Aktifkan di pengaturan perangkat.',
      ),
    [jalankan],
  );

  /**
   * Beberapa gambar sekaligus dari galeri, mis. tiga tab screenshot satu sesi
   * lari. Mengembalikan daftar kosong kalau dibatalkan.
   */
  const dariGaleriBanyak = useCallback(async (maks: number): Promise<string[]> => {
    setSibuk(true);

    try {
      const izin = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!izin.granted) {
        Alert.alert(
          'Izin diperlukan',
          'GriviTness butuh izin galeri untuk memilih screenshot. Aktifkan di pengaturan perangkat.',
        );
        return [];
      }

      const hasil = await ImagePicker.launchImageLibraryAsync({
        ...OPSI,
        allowsMultipleSelection: true,
        selectionLimit: maks,
      });
      if (hasil.canceled) return [];

      return hasil.assets.slice(0, maks).map((a) => a.uri);
    } finally {
      setSibuk(false);
    }
  }, []);

  return { dariKamera, dariGaleri, dariGaleriBanyak, sibuk };
};
