import { Image } from 'expo-image';
import { CameraIcon, ImageSquareIcon, XIcon } from 'phosphor-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

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
 * Mencatat makanan terjadi sambil memegang piring — satu ketukan lebih sedikit
 * di situ terasa nyata.
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
  if (uri) {
    return (
      <View style={[styles.slot, { aspectRatio }]}>
        <Image source={{ uri }} style={styles.image} contentFit="cover" transition={200} />

        <View style={styles.clear}>
          <IconCircle size={34} background="rgba(10, 10, 11, 0.8)" onPress={onClear}>
            <XIcon size={16} color={colors.white} weight="bold" />
          </IconCircle>
        </View>
      </View>
    );
  }

  return (
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
  );
};

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
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
   * seperti itu tidak selalu bisa dipakai sebagai acuan persentase — height
   * "100%" terhitung nol, dan fotonya tidak kelihatan sama sekali walaupun
   * sudah termuat. Mengisi penuh induknya secara absolut menghindari
   * ketergantungan itu.
   */
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
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
