import { Redirect } from 'expo-router';

import { useAuthStore } from '@/stores/auth.store';

/**
 * Persimpangan pertama saat aplikasi dibuka.
 *
 * Keadaan `loading` sudah ditahan root layout, jadi begitu layar ini dirender
 * status sesinya pasti sudah pasti, tidak ada layar kosong sekejap.
 */
export default function Index() {
  const status = useAuthStore((s) => s.status);

  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/(auth)/login'} />;
}
