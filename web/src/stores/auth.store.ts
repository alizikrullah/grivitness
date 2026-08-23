import { create } from 'zustand';

import { get, post, setAccessToken, setSessionExpiredHandler } from '@/lib/api';
import { clearTokens, readTokens, saveTokens } from '@/lib/token';
import type { AuthResult, PublicUser } from '@/types';

/**
 * `loading` adalah keadaan awal sebelum token tersimpan sempat dibaca.
 * Membedakannya dari `unauthenticated` mencegah layar login berkedip sesaat
 * bagi user yang sebenarnya sudah masuk.
 */
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: PublicUser) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  const terima = (hasil: AuthResult): void => {
    saveTokens({ access: hasil.access_token, refresh: hasil.refresh_token });
    setAccessToken(hasil.access_token);
    set({ status: 'authenticated', user: hasil.user });
  };

  const keluar = (): void => {
    clearTokens();
    setAccessToken(null);
    set({ status: 'unauthenticated', user: null });
  };

  // Lapisan HTTP memanggil ini ketika refresh token ditolak. Tanpa jalur ini,
  // aplikasi akan diam di halaman kosong dengan token yang sudah mati.
  setSessionExpiredHandler(() => {
    setAccessToken(null);
    set({ status: 'unauthenticated', user: null });
  });

  return {
    status: 'loading',
    user: null,

    bootstrap: async () => {
      const tokens = readTokens();

      if (!tokens) {
        set({ status: 'unauthenticated', user: null });
        return;
      }

      setAccessToken(tokens.access);

      try {
        // Sekaligus memastikan token benar-benar masih berlaku. Kalau access
        // token sudah kedaluwarsa, interceptor akan memperbaruinya di sini —
        // jauh sebelum user menyentuh halaman mana pun.
        const user = await get<PublicUser>('/api/users/me');
        set({ status: 'authenticated', user });
      } catch {
        keluar();
      }
    },

    login: async (email, password) => {
      terima(await post<AuthResult>('/api/auth/login', { email, password }));
    },

    register: async (name, email, password) => {
      terima(await post<AuthResult>('/api/auth/register', { name, email, password }));
    },

    logout: async () => {
      const tokens = readTokens();

      // Sesi dibersihkan lebih dulu supaya user tetap keluar walau permintaan
      // ke server gagal. Refresh token yang tertinggal di server akan mati
      // sendiri dalam 7 hari.
      keluar();

      if (tokens) {
        try {
          await post('/api/auth/logout', { refresh_token: tokens.refresh });
        } catch {
          // Kegagalan di sini tidak mengubah apa pun bagi user.
        }
      }
    },

    setUser: (user) => set({ user }),
  };
});
