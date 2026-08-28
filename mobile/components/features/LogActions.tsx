import { PencilSimpleIcon, TrashIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog, IconCircle } from '@/components/ui';
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
 * duduk persis di sebelah tombol ubah, tanpa konfirmasi, satu salah sentuh
 * menghilangkan catatan yang tidak bisa dikembalikan.
 *
 * Dialognya memakai ConfirmDialog, bukan Alert.alert. Alert bawaan menggambar
 * dialog milik sistem operasi yang terang dan bergaya Android, dan di aplikasi
 * segelap ini ia terasa datang dari aplikasi lain, tepat pada momen yang paling
 * butuh perhatian user.
 */
export const LogActions = ({ onEdit, onDelete, deleteMessage, row = false }: LogActionsProps) => {
  const [tanya, setTanya] = useState(false);

  return (
    <View style={row ? styles.row : styles.column}>
      {onEdit ? (
        <IconCircle size={36} onPress={onEdit}>
          <PencilSimpleIcon size={16} color={colors.textSecondary} weight="regular" />
        </IconCircle>
      ) : null}

      {onDelete ? (
        <>
          <IconCircle size={36} onPress={() => setTanya(true)}>
            <TrashIcon size={16} color={colors.textSecondary} weight="regular" />
          </IconCircle>

          <ConfirmDialog
            visible={tanya}
            title="Hapus catatan?"
            message={deleteMessage ?? 'Catatan ini akan dihapus permanen.'}
            onCancel={() => setTanya(false)}
            onConfirm={() => {
              setTanya(false);
              onDelete();
            }}
          />
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  column: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});
