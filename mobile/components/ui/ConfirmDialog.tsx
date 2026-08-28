import * as Haptics from 'expo-haptics';
import { WarningIcon } from 'phosphor-react-native';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { Button } from './Button';
import { Text } from './Text';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  /** Teks tombol yang meneruskan tindakan. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tindakannya merusak, jadi tombolnya merah dan ikon peringatan ikut tampil. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog konfirmasi bertema aplikasi, pengganti Alert.alert bawaan.
 *
 * Alert.alert menggambar dialog milik sistem operasi: putih terang, sudut dan
 * tipografi Android, tombol biru. Di aplikasi bertema segelap ini, dialog itu
 * terasa seperti datang dari aplikasi lain, dan justru muncul pada momen paling
 * penting, saat user memutuskan menghapus sesuatu yang tidak bisa dikembalikan.
 *
 * Dibangun di atas Modal supaya seluruh warnanya datang dari palet yang sama
 * dengan sisa aplikasi.
 */
export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onCancel}
    statusBarTranslucent
  >
    {/*
      Menyentuh latar membatalkan, bukan meneruskan. Untuk tindakan merusak,
      gerakan yang tidak sengaja harus selalu jatuh ke pilihan yang aman.
    */}
    <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Batal" />

    <View style={styles.tengah} pointerEvents="box-none">
      <View style={styles.kartu}>
        {destructive ? (
          <View style={styles.ikon}>
            <WarningIcon size={22} color={colors.danger} weight="duotone" />
          </View>
        ) : null}

        <View style={styles.teks}>
          <Text variant="h3" align="center">
            {title}
          </Text>
          <Text variant="body" tone="secondary" align="center">
            {message}
          </Text>
        </View>

        {/*
          Tiap tombol dibungkus View ber-flex, karena fullWidth di Button hanya
          meregang pada sumbu silang. Di dalam baris, itu tidak membagi lebarnya.
        */}
        <View style={styles.tombol}>
          <View style={styles.sisi}>
            <Button label={cancelLabel} variant="secondary" size="md" onPress={onCancel} />
          </View>

          <View style={styles.sisi}>
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              size="md"
              onPress={() => {
                // Getaran yang lebih berat daripada tombol biasa, menandai bahwa
                // yang barusan terjadi tidak bisa dibatalkan.
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                onConfirm();
              }}
            />
          </View>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  /*
    Lapisan pemusat memakai box-none supaya sentuhan di luar kartu tetap sampai
    ke backdrop di bawahnya, dan dialognya bisa ditutup dengan menyentuh sekitar.
  */
  tengah: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  kartu: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  ikon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  teks: { gap: spacing.sm },
  /* Batal di kiri, tindakan merusak di kanan, keduanya selebar setengah kartu. */
  tombol: { flexDirection: 'row', gap: spacing.md, alignSelf: 'stretch' },
  sisi: { flex: 1 },
});
