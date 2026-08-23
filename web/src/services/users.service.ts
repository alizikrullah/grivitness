import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query';
import { useAuthStore } from '@/stores/auth.store';
import type { ActivityLevel, Gender, Profile, PublicUser } from '@/types';

export interface ProfileInput {
  height_cm: number;
  birth_date: string;
  gender: Gender;
  activity_level: ActivityLevel;
}

export const useMe = () =>
  useQuery({ queryKey: qk.me, queryFn: () => get<PublicUser>('/api/users/me') });

/**
 * Profil boleh belum ada — user baru daftar belum mengisinya. Backend membalas
 * 404 dalam keadaan itu, dan itu bukan kesalahan yang perlu ditampilkan.
 */
export const useProfile = () =>
  useQuery({
    queryKey: qk.profile,
    queryFn: async () => {
      try {
        return await get<Profile>('/api/users/me/profile');
      } catch {
        return null;
      }
    },
  });

export const useUpdateMe = () => {
  const client = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: (body: { name: string }) => patch<PublicUser>('/api/users/me', body),
    onSuccess: (user) => {
      setUser(user);
      client.setQueryData(qk.me, user);
    },
  });
};

export const useSaveProfile = (mode: 'create' | 'update') => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<ProfileInput>) =>
      mode === 'create'
        ? post<Profile>('/api/users/me/profile', body)
        : patch<Profile>('/api/users/me/profile', body),
    onSuccess: (profile) => {
      client.setQueryData(qk.profile, profile);
      // TDEE ikut berubah, dan ringkasan harian memakainya untuk kalori keluar.
      void client.invalidateQueries({ queryKey: ['summary'] });
    },
  });
};
