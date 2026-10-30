import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query';
import type {
  CalendarDays,
  CalendarSection,
  DailyOverview,
  DailySummary,
  Goal,
  GoalWithProgress,
  NotificationSettings,
  PeriodSummary,
  Streak,
  HistorySummary,
} from '@/types';
import { todayWIB } from '@/utils/date';

export const useStreak = () =>
  useQuery({ queryKey: qk.streak, queryFn: () => get<Streak>('/api/streaks/me') });

export const useDailySummary = (date: string = todayWIB()) =>
  useQuery({
    queryKey: qk.summaryDaily(date),
    queryFn: () => get<DailySummary>('/api/summary/daily', { params: { date } }),
  });

/**
 * Overview beranda. Kuncinya ikut tanggal supaya berganti sendiri lewat
 * tengah malam, dan staleTime-nya panjang: isinya cuma berubah kalau user
 * mencatat sesuatu, dan setiap catatan sudah menyegarkan semua kunci
 * 'summary'. Bolak-balik ke beranda tidak perlu meminta ulang.
 */
export const useDailyOverview = () => {
  const hariIni = todayWIB();
  return useQuery({
    queryKey: qk.summaryOverview(hariIni),
    queryFn: () => get<DailyOverview>('/api/summary/overview'),
    staleTime: 5 * 60_000,
  });
};

/** Riwayat masuk vs keluar per hari, untuk halaman kontrol defisit. */
export const useCalorieHistory = (days: number) =>
  useQuery({
    queryKey: qk.summaryHistory(days),
    queryFn: () => get<HistorySummary>('/api/summary/history', { params: { days } }),
  });

/**
 * Tanggal yang ada datanya untuk satu layar catat, untuk titik di kalender.
 * Kuncinya di bawah 'summary', jadi ikut segar setiap kali user mencatat.
 */
export const useCalendarDays = (type: CalendarSection, from: string, to: string, aktif = true) =>
  useQuery({
    queryKey: qk.calendar(type, from, to),
    queryFn: () => get<CalendarDays>('/api/summary/calendar', { params: { type, from, to } }),
    enabled: aktif,
    staleTime: 60_000,
  });

export const useWeeklySummary = (from: string) =>
  useQuery({
    queryKey: qk.summaryWeekly(from),
    queryFn: () => get<PeriodSummary>('/api/summary/weekly', { params: { from } }),
  });

export const useMonthlySummary = (year: number, month: number) =>
  useQuery({
    queryKey: qk.summaryMonthly(year, month),
    queryFn: () => get<PeriodSummary>('/api/summary/monthly', { params: { year, month } }),
  });

/** Balasan null berarti user belum menetapkan target apa pun. */
export const useActiveGoal = () =>
  useQuery({
    queryKey: qk.activeGoal,
    queryFn: async () => {
      try {
        return await get<GoalWithProgress | null>('/api/goals/active');
      } catch {
        return null;
      }
    },
  });

export const useGoalHistory = () =>
  useQuery({ queryKey: qk.goals, queryFn: () => get<Goal[]>('/api/goals') });

export interface GoalInput {
  target_weight_kg: number;
  target_date: string;
  /** Diketik: jatah manual yang dikunci. Kosong: jatah otomatis mengikuti berat terbaru. */
  daily_calorie_budget?: number;
}

export const useCreateGoal = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: GoalInput) => post<Goal>('/api/goals', body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['goals'] });
      void client.invalidateQueries({ queryKey: ['summary'] });
    },
  });
};

export const useUpdateGoal = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: { id: string } & Partial<Omit<GoalInput, 'daily_calorie_budget'>> & {
        is_active?: boolean;
        /** null mengembalikan jatah ke otomatis. */
        daily_calorie_budget?: number | null;
      }) => patch<Goal>('/api/goals/' + id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['goals'] });
      void client.invalidateQueries({ queryKey: ['summary'] });
    },
  });
};

export const useNotificationSettings = () =>
  useQuery({
    queryKey: qk.notifications,
    queryFn: () => get<NotificationSettings>('/api/notifications/settings'),
  });

export const useUpdateNotificationSettings = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: Partial<NotificationSettings>) =>
      patch<NotificationSettings>('/api/notifications/settings', body),
    onSuccess: (data) => client.setQueryData(qk.notifications, data),
  });
};
