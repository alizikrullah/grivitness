import { Image } from 'expo-image';
import {
  ArrowClockwiseIcon,
  CameraIcon,
  CheckCircleIcon,
  ImageSquareIcon,
  WarningIcon,
  XIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { IconCircle, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';

interface PhotoSlotProps {
  uri: string | null;
  label: string;
  onCamera: () => void;
  onGallery: () => void;
  onClear: () => void;
  /** Perbandingan sisi. Foto badan lebih tinggi dari foto makanan. */
  aspectRatio?: number;
  disabled?: boolean;
}

/**
 * Kotak untuk satu foto: kosong berarti dua tombol pengambilan, terisi berarti
 * pratinjau dengan tombol hapus.
 *
 * Kamera dan galeri ditawarkan berdampingan, tidak lewat menu bertingkat.
 * Mencatat makanan terjadi sambil memegang piring, dan satu ketukan lebih
 * sedikit di situ terasa nyata.
 */
export const PhotoSlot = ({
  uri,
  label,
  onCamera,
  onGallery,
  onClear,
  aspectRatio = 1,
  disabled = false,
}: PhotoSlotProps) => {
  const [memuat, setMemuat] = useState(false);
  const [gagal, setGagal] = useState(false);

  /**
   * Menaikkan angka ini memaksa expo-image membaca ulang berkasnya, dipakai
   * tombol coba lagi. Tanpa key yang berubah, komponen yang sudah gagal cuma
   * memasang kembali kegagalan yang sama dari cache-nya.
   */
  const [percobaan, setPercobaan] = useState(0);

  /**
   * Keadaan disetel ulang saat render ketika foto berganti, bukan lewat
   * useEffect. Menyelaraskan state dengan prop di dalam efek berarti satu
   * render terlanjur memakai keadaan foto sebelumnya.
   */
  const [uriTerakhir, setUriTerakhir] = useState(uri);
  if (uri !== uriTerakhir) {
    setUriTerakhir(uri);
    setMemuat(uri !== null);
    setGagal(false);
  }

  /**
   * Lebar kotak diukur sendiri, lalu tingginya DIHITUNG, bukan diserahkan ke
   * aspectRatio.
   *
   * Ini sebab pratinjaunya tidak pernah muncul. Saat kotak masih kosong, isinya
   * dua tombol yang memberi tinggi apa adanya. Begitu terisi, satu-satunya anak
   * adalah gambar yang diposisikan absolut, dan anak absolut TIDAK menyumbang
   * tinggi ke induknya. Tinggi kotak jadi sepenuhnya bergantung pada aspectRatio
   * yang harus diturunkan dari lebarnya, dan ketika itu gagal diselesaikan
   * tingginya nol: gambarnya termuat, tapi tidak punya ruang untuk digambar.
   *
   * Karena kotak kosongnya tetap terlihat normal, kegagalan ini tidak pernah
   * kelihatan seperti masalah tata letak.
   *
   * Ukuran piksel yang pasti juga yang disarankan untuk expo-image di Android,
   * daripada mengandalkan persentase atau aspectRatio yang bergantung pada
   * induknya.
   */
  const [lebar, setLebar] = useState(0);
  const tinggi = lebar > 0 ? Math.round(lebar / aspectRatio) : 0;
  const terukur = lebar > 0;

  if (uri) {
    return (
      <View style={styles.wrap}>
        <View
          // Sebelum terukur, aspectRatio dipakai supaya kotaknya punya bentuk
          // dan onLayout benar-benar terpanggang. Sesudahnya, tinggi pastilah
          // angka piksel yang tidak bisa gagal diselesaikan.
          style={[styles.slot, terukur ? { width: lebar, height: tinggi } : { aspectRatio }]}
          onLayout={(e) => setLebar(Math.round(e.nativeEvent.layout.width))}
        >
          <Image
            source={{ uri }}
            style={
              terukur ? { width: lebar, height: tinggi, borderRadius: radius.lg } : styles.image
            }
            contentFit="cover"
            /*
              TIDAK ada transition, dan ini bukan sekadar selera.

              Di Android, cross-fade expo-image punya bug yang membuat gambar
              tetap tak terlihat walaupun sudah selesai dimuat: onLoad terpanggil,
              tapi opacity-nya tidak pernah naik. Gejalanya kotak kosong tanpa
              spinner dan tanpa pesan error, persis yang terjadi di sini.

              Dua satu-satunya pemakaian expo-image di aplikasi ini sama-sama
              memakai transition, dan tidak satu pun gambar pernah tampil.

              recyclingKey ikut dilepas karena kotak ini tidak pernah berada di
              dalam daftar yang mendaur ulang view. Yang memaksa pembacaan ulang
              cukup key di bawah, dan itu remount sungguhan.
            */
            key={uri + ':' + percobaan}
            onLoad={() => {
              setMemuat(false);
              setGagal(false);
            }}
            onError={() => {
              setMemuat(false);
              setGagal(true);
            }}
          />

          {memuat ? (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          ) : null}

          {/*
            Gagal memuat TIDAK berarti fotonya tidak terpilih. URI-nya tetap
            dipegang dan tetap akan terkirim saat disimpan. Yang gagal cuma
            menggambarnya, jadi yang ditawarkan menggambar ulang, bukan
            membuang fotonya.
          */}
          {gagal ? (
            <View style={styles.overlay}>
              <WarningIcon size={22} color={colors.warning} weight="duotone" />
              <Text variant="caption" tone="secondary" style={styles.tengah}>
                Pratinjau gagal tampil. Fotonya tetap terpasang.
              </Text>
              <Pressable
                onPress={() => {
                  setGagal(false);
                  setMemuat(true);
                  setPercobaan((n) => n + 1);
                }}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <ArrowClockwiseIcon size={14} color={colors.textPrimary} weight="bold" />
                <Text variant="caption">Coba tampilkan lagi</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.clear}>
            <IconCircle size={34} background="rgba(10, 10, 11, 0.8)" onPress={onClear}>
              <XIcon size={16} color={colors.white} weight="bold" />
            </IconCircle>
          </View>
        </View>

        {/*
          Penanda ini sengaja TIDAK bergantung pada gambarnya berhasil tampil.
          Yang menentukan foto akan terkirim adalah adanya URI, dan itu sudah
          pasti di titik ini. Tanpa penanda terpisah, pratinjau yang lambat atau
          gagal terbaca sama persis seperti foto yang belum diambil.
        */}
        <View style={styles.siap}>
          <CheckCircleIcon size={15} color={colors.success} weight="fill" />
          <Text variant="caption" tone="secondary">
            Foto siap dikirim
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.slot, styles.empty, { aspectRatio }]}>
        <Text variant="caption" tone="tertiary">
          {label}
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onCamera}
            disabled={disabled}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <CameraIcon size={20} color={colors.textPrimary} weight="duotone" />
            <Text variant="caption">Kamera</Text>
          </Pressable>

          <Pressable
            onPress={onGallery}
            disabled={disabled}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <ImageSquareIcon size={20} color={colors.textPrimary} weight="duotone" />
            <Text variant="caption">Galeri</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: spacing.sm },
  /*
    TANPA overflow: 'hidden', dan ini sebab pratinjaunya selama ini kosong.

    Terbukti lewat perbandingan langsung: foto yang SAMA tampil normal di kotak
    uji berukuran tetap yang tidak memotong isinya, tapi tidak pernah tergambar
    di kotak ini. Satu-satunya beda memang pemotongannya. Di Android, memaksa
    induk memotong isinya lewat clipping path bersama borderRadius bisa membuat
    gambar di dalamnya tidak pernah sampai ke layar.

    Sudut membulat sekarang dipasang pada gambarnya sendiri, jadi bentuknya tetap
    sama tanpa perlu ada yang dipotong.
  */
  slot: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  /**
   * Dipasang absolut, bukan lebar-tinggi 100%.
   *
   * Tinggi kotak ini berasal dari aspectRatio, dan di Android tinggi turunan
   * seperti itu tidak selalu bisa dipakai sebagai acuan persentase: height
   * "100%" terhitung nol, dan fotonya tidak kelihatan sama sekali walaupun
   * sudah termuat. Mengisi penuh induknya secara absolut menghindari
   * ketergantungan itu.
   */
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.lg },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(10, 10, 11, 0.72)',
  },
  tengah: { textAlign: 'center' },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHigh,
  },
  siap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clear: { position: 'absolute', top: spacing.sm, right: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  pressed: { opacity: 0.7 },
});
