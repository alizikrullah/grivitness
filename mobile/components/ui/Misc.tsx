import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { clamp } from '@/utils/format';
import { Text } from './Text';

/** Batang progres tipis untuk target harian. */
export const ProgressBar = ({
  progress,
  color = colors.primary,
  height = 8,
}: {
  progress: number;
  color?: string;
  height?: number;
}) => (
  <View style={[styles.track, { height, borderRadius: height / 2 }]}>
    <View
      style={{
        width: ((clamp(progress, 0, 1) * 100).toFixed(2) + '%') as ViewStyle['width'],
        height: '100%',
        borderRadius: height / 2,
        backgroundColor: color,
      }}
    />
  </View>
);

/**
 * Pil kecil berisi ikon dan label, seperti "Kcal" dan "Pulse" di referensi.
 * Ikon duduk di lingkaran gelap sendiri supaya tetap terbaca di atas foto.
 */
export const StatPill = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
}) => (
  <View style={styles.pill}>
    <View style={styles.pillIcon}>{icon}</View>
    <View>
      {value ? (
        <Text variant="label" numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <Text variant="caption" tone={value ? 'secondary' : 'primary'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  </View>
);

/** Baris label kiri dan nilai kanan. Dipakai di ringkasan dan detail. */
export const Row = ({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'secondary';
}) => (
  <View style={styles.row}>
    <View style={styles.rowLeft}>
      {icon}
      <Text variant="bodyMedium" tone="secondary">
        {label}
      </Text>
    </View>
    <Text variant="label" tone={tone}>
      {value}
    </Text>
  </View>
);

/** Judul bagian dengan aksi opsional di kanan. */
export const SectionHeader = ({ title, action }: { title: string; action?: ReactNode }) => (
  <View style={styles.section}>
    <Text variant="h3">{title}</Text>
    {action}
  </View>
);

export const EmptyState = ({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) => (
  <View style={styles.empty}>
    {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
    <Text variant="h3" align="center">
      {title}
    </Text>
    {message ? (
      <Text variant="body" tone="secondary" align="center">
        {message}
      </Text>
    ) : null}
    {action}
  </View>
);

export const Loading = ({ style }: { style?: ViewStyle }) => (
  <View style={[styles.loading, style]}>
    <ActivityIndicator color={colors.primary} />
  </View>
);

/**
 * Pesan kesalahan yang bisa ditindaklanjuti.
 *
 * Sengaja menampilkan pesan dari backend apa adanya — pesannya sudah berbahasa
 * Indonesia dan menjelaskan persoalannya. Menggantinya dengan teks umum seperti
 * "Terjadi kesalahan" justru membuang keterangan yang berguna.
 */
export const ErrorNote = ({ message }: { message: string }) => (
  <View style={styles.error}>
    <Text variant="caption" tone="accent">
      {message}
    </Text>
  </View>
);

/** Kotak abu berdenyut sebagai pengganti isi yang sedang dimuat. */
export const Skeleton = ({
  height = 20,
  width = '100%',
  style,
}: {
  height?: number;
  width?: number | string;
  style?: ViewStyle;
}) => (
  <View
    style={[
      styles.skeleton,
      { height, width: width as ViewStyle['width'], borderRadius: height > 40 ? radius.lg : 6 },
      style,
    ]}
  />
);

export const Divider = () => <View style={styles.divider} />;

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 6,
    paddingRight: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(20, 20, 22, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
    alignSelf: 'flex-start',
  },
  pillIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.xs,
  },
  loading: { paddingVertical: spacing.xxl, alignItems: 'center' },
  error: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
  },
  skeleton: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
