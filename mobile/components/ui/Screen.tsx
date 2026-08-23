import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { spacing } from '@/constants/theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Ruang bawah tambahan supaya isi tidak tertutup tab bar melayang. */
  bottomInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}

/** Tinggi tab bar melayang plus jaraknya dari tepi bawah. */
export const TAB_BAR_SPACE = 96;

export const Screen = ({
  children,
  scroll = true,
  bottomInset = false,
  refreshing,
  onRefresh,
  style,
  contentStyle,
}: ScreenProps) => {
  const insets = useSafeAreaInsets();

  /**
   * Jarak atas dihitung dari safe area DITAMBAH ruang nafas sendiri.
   *
   * Safe area hanya menjamin isi tidak tertutup notch atau status bar — ia
   * berhenti persis di batas itu, sehingga judul halaman menempel ke tepi
   * layar dan terasa sesak. Tambahan di bawah ini yang memberi jarak.
   */
  const padding = {
    paddingTop: insets.top + spacing.xl,
    paddingBottom: (bottomInset ? TAB_BAR_SPACE : insets.bottom) + spacing.xl,
  };

  if (!scroll) {
    return (
      <View style={[styles.root, padding, style]}>
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.root, style]}
      contentContainerStyle={[styles.content, padding, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
});
