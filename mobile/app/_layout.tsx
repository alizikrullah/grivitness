// Diimpor per varian, bukan dari akar paket. Mengimpor dari akar menarik
// keempat belas varian termasuk delapan italic yang tidak dipakai, sekitar
// 800KB font mati yang ikut masuk ke bundel aplikasi.
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { usePushToken } from '@/hooks/usePushToken';
import { queryClient } from '@/lib/query';
import { useAuthStore } from '@/stores/auth.store';

void SplashScreen.preventAutoHideAsync();

/**
 * Menjaga user tetap berada di bagian aplikasi yang sesuai keadaan sesinya.
 *
 * Pengalihan dilakukan di sini, bukan di masing-masing layar. Kalau tiap layar
 * memeriksa sendiri, satu layar yang lupa memeriksanya sudah cukup membuat data
 * ter-render dengan token yang sudah mati.
 */
const useAuthGate = (siap: boolean) => {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!siap || status === 'loading') return;

    const diAreaAuth = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !diAreaAuth) {
      router.replace('/(auth)/login');
    } else if (status === 'authenticated' && diAreaAuth) {
      router.replace('/(tabs)');
    }
  }, [siap, status, segments, router]);
};

const RootNavigator = () => {
  const [fontSiap, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Font yang gagal dimuat tidak boleh menahan aplikasi selamanya. Lebih baik
  // tampil dengan font sistem daripada berhenti di layar splash.
  const siap = (fontSiap || fontError !== null) && status !== 'loading';

  useAuthGate(siap);

  // Baru didaftarkan setelah user masuk, permintaan token butuh Authorization,
  // dan meminta izin notifikasi di layar login akan terasa memaksa.
  usePushToken(status === 'authenticated');

  useEffect(() => {
    if (siap) void SplashScreen.hideAsync();
  }, [siap]);

  if (!siap) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="log" />
    </Stack>
  );
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <RootNavigator />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
