import { QueryClientProvider } from '@tanstack/react-query';
import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/components/layout/AppLayout';
import { Loading } from '@/components/ui';
import { queryClient } from '@/lib/query';
import { AuthPage } from '@/pages/auth/AuthPage';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Halaman di dalam aplikasi dimuat terpisah dari halaman masuk.
 *
 * Recharts dan seluruh panel pencatatan menyumbang bagian terbesar bundel, dan
 * tidak satu pun dibutuhkan oleh orang yang baru membuka halaman login. Tanpa
 * pemisahan ini, layar pertama yang dilihat orang justru menunggu unduhan
 * paling berat di aplikasi.
 *
 * AuthPage sengaja TIDAK ikut dipisah — memuatnya secara terpisah malah
 * menambah satu perjalanan jaringan sebelum layar pertama bisa digambar.
 */
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const LogPage = lazy(() => import('@/pages/log/LogPage').then((m) => ({ default: m.LogPage })));
const ProgressPage = lazy(() =>
  import('@/pages/ProgressPage').then((m) => ({ default: m.ProgressPage })),
);
const ProfilePage = lazy(() =>
  import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

/**
 * Gerbang autentikasi.
 *
 * Keadaan `loading` DIBEDAKAN dari `unauthenticated`. Kalau keduanya
 * disamakan, user yang sebenarnya sudah masuk akan melihat halaman login
 * berkedip sepersekian detik setiap kali me-refresh — karena token yang
 * tersimpan belum sempat diverifikasi ke server.
 */
const Terlindungi = () => {
  const status = useAuthStore((s) => s.status);

  if (status === 'loading') return <Loading label="Menyiapkan sesi…" />;
  if (status === 'unauthenticated') return <Navigate to="/login" replace />;

  return <Outlet />;
};

const Isi = () => {
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route element={<Terlindungi />}>
        <Route element={<AppLayout />}>
          {/* Suspense di dalam AppLayout, bukan membungkusnya. Kalau di luar,
              sidebar ikut hilang setiap berpindah halaman dan seluruh kerangka
              aplikasi berkedip. */}
          <Route
            index
            element={
              <Suspense fallback={<Loading />}>
                <DashboardPage />
              </Suspense>
            }
          />
          {/* Halaman Catat punya rute anaknya sendiri, jadi diberi wildcard. */}
          <Route
            path="log/*"
            element={
              <Suspense fallback={<Loading />}>
                <LogPage />
              </Suspense>
            }
          />
          <Route
            path="progress"
            element={
              <Suspense fallback={<Loading />}>
                <ProgressPage />
              </Suspense>
            }
          />
          <Route
            path="profile"
            element={
              <Suspense fallback={<Loading />}>
                <ProfilePage />
              </Suspense>
            }
          />
        </Route>
      </Route>

      {/* Alamat yang tidak dikenal dikembalikan ke beranda, bukan dibiarkan
          menampilkan halaman kosong tanpa penjelasan. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <Isi />
    </BrowserRouter>
  </QueryClientProvider>
);
