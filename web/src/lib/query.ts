import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api';

/**
 * Kunci cache terpusat.
 *
 * Dikumpulkan di satu tempat supaya pembatalan cache lintas fitur tidak
 * bergantung pada string yang diketik ulang. Mencatat berat badan harus
 * menyegarkan ringkasan harian dan streak sekaligus, kalau kuncinya tersebar,
 * satu saja yang salah ketik dan angkanya jadi basi tanpa ada yang menyadari.
 */
export const qk = {
  me: ['me'] as const,
  profile: ['profile'] as const,
  goals: ['goals'] as const,
  activeGoal: ['goals', 'active'] as const,
  streak: ['streak'] as const,
  chat: ['chat'] as const,
  notifications: ['notifications'] as const,

  summaryDaily: (date: string) => ['summary', 'daily', date] as const,
  summaryWeekly: (from: string) => ['summary', 'weekly', from] as const,
  summaryMonthly: (year: number, month: number) => ['summary', 'monthly', year, month] as const,

  weightToday: ['weight', 'today'] as const,
  weightDate: (date: string) => ['weight', 'date', date] as const,
  weightRange: (from: string, to: string) => ['weight', 'range', from, to] as const,

  stepsToday: ['steps', 'today'] as const,
  stepsDate: (date: string) => ['steps', 'date', date] as const,
  stepsRange: (from: string, to: string) => ['steps', 'range', from, to] as const,

  waterToday: ['water', 'today'] as const,
  waterDate: (date: string) => ['water', 'date', date] as const,

  sleepToday: ['sleep', 'today'] as const,
  sleepDate: (date: string) => ['sleep', 'date', date] as const,
  sleepRange: (from: string, to: string) => ['sleep', 'range', from, to] as const,

  moodToday: ['mood', 'today'] as const,
  moodDate: (date: string) => ['mood', 'date', date] as const,
  moodRange: (from: string, to: string) => ['mood', 'range', from, to] as const,

  measurementsLatest: ['measurements', 'latest'] as const,
  measurementsDate: (date: string) => ['measurements', 'date', date] as const,
  measurementsRange: (from: string, to: string) => ['measurements', 'range', from, to] as const,

  workoutsToday: ['workouts', 'today'] as const,
  workoutsDate: (date: string) => ['workouts', 'date', date] as const,
  workoutsRange: (from: string, to: string) => ['workouts', 'range', from, to] as const,
  workoutLibrary: (category?: string, search?: string) =>
    ['workouts', 'library', category ?? '', search ?? ''] as const,
  customWorkouts: ['workouts', 'custom'] as const,

  foodToday: ['food', 'today'] as const,
  foodDate: (date: string) => ['food', 'date', date] as const,

  bodyPhotoToday: ['body-photos', 'today'] as const,
  bodyPhotoDate: (date: string) => ['body-photos', 'date', date] as const,
  bodyPhotoRange: (from: string, to: string) => ['body-photos', 'range', from, to] as const,

  deviceEnergyToday: ['device-energy', 'today'] as const,
  deviceEnergyDate: (date: string) => ['device-energy', 'date', date] as const,
  deviceEnergyRange: (from: string, to: string) => ['device-energy', 'range', from, to] as const,
};

/** Kelompok kunci yang perlu disegarkan setiap kali user mencatat sesuatu. */
export const invalidateAfterLog = (client: QueryClient): void => {
  void client.invalidateQueries({ queryKey: ['summary'] });
  void client.invalidateQueries({ queryKey: qk.streak });
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: (gagalKe, error) => {
        // Percuma mengulang kalau memang tidak berhak, tidak ditemukan, atau
        // permintaannya salah. Yang layak diulang cuma gangguan sementara.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return gagalKe < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Mutasi tidak pernah diulang otomatis. Mengulang POST bisa membuat
      // catatan dobel, dan untuk collection harian justru memicu DUPLICATE_ENTRY.
      retry: false,
    },
  },
});
