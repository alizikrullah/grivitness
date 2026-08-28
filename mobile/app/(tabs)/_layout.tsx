import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import {
  ChartLineUpIcon,
  HouseIcon,
  PlusCircleIcon,
  UserCircleIcon,
  type IconProps,
} from 'phosphor-react-native';
import type { ComponentType } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatBubble } from '@/components/features/ChatBubble';
import { Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';

interface TabDef {
  name: string;
  label: string;
  Icon: ComponentType<IconProps>;
}

const TABS: TabDef[] = [
  { name: 'index', label: 'Beranda', Icon: HouseIcon },
  { name: 'log', label: 'Catat', Icon: PlusCircleIcon },
  { name: 'progress', label: 'Progres', Icon: ChartLineUpIcon },
  { name: 'profile', label: 'Profil', Icon: UserCircleIcon },
];

/**
 * Tab bar melayang dengan latar buram.
 *
 * Tab bar bawaan menempel ke tepi bawah dan memakai gaya sistem, yang di tema
 * segelap ini terlihat seperti potongan dari aplikasi lain. Versi kustom di
 * sini mengambang di atas isi halaman, karena itu setiap Screen menyediakan
 * ruang bawah lewat prop bottomInset.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    /*
      Tabs dibungkus View karena ChatBubble diposisikan absolut terhadap
      induknya. Tanpa pembungkus ini, "bawah" yang dirujuknya adalah kotak
      navigator, bukan layar, dan gelembungnya melayang di tempat yang salah.
    */
    <View style={styles.layar}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
        tabBar={({ state, navigation }) => (
          <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, spacing.md) }]}>
            <BlurView intensity={Platform.OS === 'ios' ? 40 : 0} tint="dark" style={styles.bar}>
              {TABS.map((tab) => {
                // Dicocokkan lewat nama route, bukan lewat urutan array. Urutan
                // di state.routes ditentukan navigator dan tidak dijamin sama
                // dengan urutan TABS, menyamakan indeksnya begitu saja membuat
                // tab yang menyala meleset begitu urutannya berbeda.
                const aktif = state.routes[state.index]?.name === tab.name;
                const { Icon } = tab;

                return (
                  <Pressable
                    key={tab.name}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: aktif }}
                    accessibilityLabel={tab.label}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      navigation.navigate(tab.name);
                    }}
                    style={({ pressed }) => [
                      styles.item,
                      aktif ? styles.itemActive : styles.itemIdle,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Icon
                      size={22}
                      color={aktif ? colors.white : colors.textSecondary}
                      weight={aktif ? 'fill' : 'regular'}
                    />
                    {aktif ? (
                      <Text variant="caption" tone="inverse" numberOfLines={1}>
                        {tab.label}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </BlurView>
          </View>
        )}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} />
        ))}
      </Tabs>

      <ChatBubble />
    </View>
  );
}

const styles = StyleSheet.create({
  layar: { flex: 1 },
  wrapper: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(26, 26, 30, 0.6)' : 'rgba(26, 26, 30, 0.97)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.pill,
  },
  /**
   * Tab tidak aktif memakai lebar tetap secukupnya ikon, sementara tab aktif
   * mengambil sisa ruang.
   *
   * Sebelumnya keempatnya sama-sama flex: 1, jadi pil merah dapat jatah yang
   * sama dengan slot yang cuma berisi ikon, padahal ia harus memuat ikon DAN
   * teks. Label sepanjang "Beranda" jadi mepet ke tepi pil dan terlihat sesak.
   */
  itemIdle: { width: 56 },
  itemActive: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    minWidth: 120,
  },
  pressed: { opacity: 0.75 },
});
