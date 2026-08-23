import { XIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { IconCircle } from './IconCircle';
import { Text } from './Text';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Tombol yang menempel di bawah, di luar area gulir. */
  footer?: ReactNode;
}

/**
 * Panel yang muncul dari bawah layar.
 *
 * Dipakai untuk memilih dari daftar panjang (library olahraga, level aktivitas)
 * tanpa memindahkan user ke halaman lain. Isinya bisa digulir, sementara tombol
 * aksi tetap menempel di bawah supaya selalu terjangkau ibu jari.
 */
export const Sheet = ({ visible, onClose, title, children, footer }: SheetProps) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Tutup" />

      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />

        <View style={styles.header}>
          <Text variant="h2" style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <IconCircle size={36} onPress={onClose}>
            <XIcon size={18} color={colors.textSecondary} weight="bold" />
          </IconCircle>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    paddingTop: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceHigh,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
