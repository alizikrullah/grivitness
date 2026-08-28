import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import { ArrowClockwiseIcon, WarningIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { imageSource } from '@/lib/api';

interface RemoteImageProps {
  /** Nilai photo_url dari backend, misalnya "/api/files/{id}". */
  path: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  /**
   * Perbandingan sisi, diberikan lewat prop dan BUKAN lewat style.
   *
   * Tingginya dihitung sendiri dari lebar yang terukur. Kalau aspectRatio
   * ditaruh di style, tingginya harus diselesaikan Yoga dari lebar induknya,
   * sementara satu-satunya anak di dalam kotak ini diposisikan absolut dan
   * tidak menyumbang tinggi apa pun. Saat penyelesaian itu gagal, tingginya nol
   * dan gambarnya termuat tanpa pernah punya ruang untuk digambar.
   */
  aspectRatio?: number;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
}

/**
 * Foto yang disajikan backend lewat proxy ber-autentikasi.
 *
 * Dibuat karena kegagalan memuat foto sebelumnya BISU sepenuhnya: `Image`
 * dipakai tanpa onError, jadi gambar yang gagal terbaca sama persis seperti
 * kartu yang memang tidak punya foto. Tidak ada satu pun keterangan yang bisa
 * dipakai untuk mencari sebabnya, baik oleh user maupun saat menelusuri kode.
 *
 * Sekarang tiga keadaannya dibedakan: sedang memuat, berhasil, dan gagal
 * beserta pesan aslinya dari pemuat gambar.
 *
 * imageSource() dipanggil di dalam sini, bukan diterima sebagai prop, supaya
 * tidak ada pemanggil yang bisa lupa menyertakan header Authorization dan
 * mengulangi kesalahan yang sama.
 */
export const RemoteImage = ({
  path,
  style,
  aspectRatio,
  contentFit = 'cover',
  accessibilityLabel,
}: RemoteImageProps) => {
  const [memuat, setMemuat] = useState(true);
  const [gagal, setGagal] = useState<string | null>(null);

  /**
   * Menaikkan angka ini memaksa pemuatan ulang yang benar-benar baru.
   *
   * Diikutkan ke recyclingKey, bukan cuma ke key komponen, karena expo-image
   * menyimpan hasil per URL. Tanpa penanda yang berubah, mencoba lagi hanya
   * memasang kembali kegagalan yang sama dari simpanannya.
   */
  const [percobaan, setPercobaan] = useState(0);

  /**
   * Keadaan disetel ulang saat render ketika fotonya berganti, bukan lewat
   * useEffect. Menyelaraskan state dengan prop di dalam efek berarti satu
   * render terlanjur memakai keadaan foto sebelumnya.
   */
  const [pathTerakhir, setPathTerakhir] = useState(path);
  if (path !== pathTerakhir) {
    setPathTerakhir(path);
    setMemuat(path != null);
    setGagal(null);
  }

  /**
   * Lebar diukur sendiri, tingginya dihitung, sama seperti di PhotoSlot.
   * Ukuran piksel yang pasti tidak bisa gagal diselesaikan.
   */
  const [lebar, setLebar] = useState(0);
  const terukur = aspectRatio !== undefined && lebar > 0;
  const ukuran = terukur ? { width: lebar, height: Math.round(lebar / aspectRatio) } : null;

  const source = imageSource(path);

  if (!source) {
    return (
      <View style={[styles.kosong, style]}>
        <Text variant="caption" tone="tertiary">
          Tanpa foto
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.wrap, style, aspectRatio !== undefined ? { aspectRatio } : null, ukuran]}
      onLayout={(e) => setLebar(Math.round(e.nativeEvent.layout.width))}
    >
      <Image
        source={source}
        style={ukuran ?? styles.isi}
        contentFit={contentFit}
        /*
          TIDAK ada transition. Cross-fade expo-image di Android punya bug yang
          membuat gambar tetap tak terlihat walaupun onLoad sudah terpanggil.
          Lihat catatan lebih panjang di PhotoSlot.

          recyclingKey DIPERTAHANKAN di sini, berbeda dengan PhotoSlot, karena
          komponen ini memang dipakai di dalam daftar. Tanpa itu, sel yang didaur
          ulang bisa menampilkan foto milik baris sebelumnya.
        */
        recyclingKey={(path ?? '') + ':' + percobaan}
        accessibilityLabel={accessibilityLabel}
        onLoad={() => {
          setMemuat(false);
          setGagal(null);
        }}
        onError={({ error }) => {
          setMemuat(false);
          // Pesan aslinya disimpan apa adanya. Menggantinya dengan kalimat
          // ramah buatan sendiri justru membuang satu-satunya petunjuk yang ada.
          setGagal(error === '' ? 'Tidak diketahui' : error);
        }}
      />

      {memuat ? (
        <View style={styles.lapis}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : null}

      {gagal !== null ? (
        <Pressable
          onPress={() => {
            setGagal(null);
            setMemuat(true);
            setPercobaan((n) => n + 1);
          }}
          style={styles.lapis}
          accessibilityRole="button"
          accessibilityLabel="Muat ulang foto"
        >
          <WarningIcon size={18} color={colors.warning} weight="duotone" />
          <Text variant="caption" tone="secondary" style={styles.tengah} numberOfLines={3}>
            {gagal}
          </Text>
          <View style={styles.ulang}>
            <ArrowClockwiseIcon size={12} color={colors.textPrimary} weight="bold" />
            <Text variant="caption">Coba lagi</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  /* TANPA overflow: 'hidden'. Lihat catatan panjang di PhotoSlot: pemotongan
     lewat induk membuat gambar tidak tergambar di Android. Sudut membulat
     diwariskan dari style pemanggil dan ikut dipasang pada gambarnya. */
  wrap: { backgroundColor: colors.surfaceHigh },
  isi: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  kosong: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  lapis: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: 'rgba(10, 10, 11, 0.82)',
  },
  tengah: { textAlign: 'center' },
  ulang: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
});
