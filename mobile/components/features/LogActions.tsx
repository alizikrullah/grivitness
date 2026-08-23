import { PencilSimpleIcon, TrashIcon } from 'phosphor-react-native';
import { Alert, StyleSheet, View } from 'react-native';

import { IconCircle } from '@/components/ui';
import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';

interface LogActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  /** Kalimat yang muncul di dialog konfirmasi hapus. */
  deleteMessage?: string;
  /** Menyusun tombol mendatar, bukan menurun. */
  row?: boolean;
}

/**
 * Tombol ubah dan hapus untuk satu baris catatan.
 *
 * Penghapusan selalu lewat konfirmasi. Tombol hapus di sini berukuran kecil dan
 * duduk persis di sebelah tombol ubah — tanpa konfirmasi, satu salah sentuh
 * menghilangkan catatan yang tidak bisa dikembalikan.
 */
export const LogActions = ({ onEdit, onDelete, deleteMessage, row = false }: LogActionsProps) => {
  const konfirmasi = () => {
    if (!onDelete) return;

    Alert.alert('Hapus catatan?', deleteMessage ?? 'Catatan ini akan dihapus permanen.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View style={row ? styles.row : styles.column}>
      {onEdit ? (
        <IconCircle size={36} onPress={onEdit}>
          <PencilSimpleIcon size={16} color={colors.textSecondary} weight="regular" />
        </IconCircle>
      ) : null}

      {onDelete ? (
        <IconCircle size={36} onPress={konfirmasi}>
          <TrashIcon size={16} color={colors.textSecondary} weight="regular" />
        </IconCircle>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  column: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});
