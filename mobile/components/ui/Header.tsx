import { useRouter } from 'expo-router';
import { CaretLeftIcon } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { IconCircle } from './IconCircle';
import { Text } from './Text';

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Menampilkan tombol kembali. Mati sendiri kalau tidak ada halaman sebelumnya. */
  back?: boolean;
  action?: ReactNode;
}

export const Header = ({ title, subtitle, back = true, action }: HeaderProps) => {
  const router = useRouter();

  return (
    <View style={styles.wrapper}>
      {back && router.canGoBack() ? (
        <IconCircle size={44} onPress={() => router.back()}>
          <CaretLeftIcon size={20} color={colors.textPrimary} weight="bold" />
        </IconCircle>
      ) : null}

      <View style={styles.titles}>
        <Text variant="h2" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {action}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  titles: { flex: 1, gap: 2 },
});
