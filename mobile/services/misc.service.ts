import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { get, patch, post } from '@/lib/api';
import { qk } from '@/lib/query';
import type { DailySummary, Goal, NotificationSettings, PeriodSummary, Streak } from '@/types';
import { todayWIB } from '@/utils/date';

export const useStreak = () =>
  useQuery({ queryKey: qk.streak, queryFn: () => get<Streak>('/api/streaks/me') });

export const useDailySummary = (date: string = todayWIB()) =>
  useQuery({
    queryKey: qk.summaryDaily(date),
    queryFn: () => get<DailySummary>('/api/summary/daily', { params: { date } }),
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
        return await get<Goal | null>('/api/goals/active');
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
    mutationFn: ({ id, ...body }: { id: string } & Partial<GoalInput> & { is_active?: boolean }) =>
      patch<Goal>('/api/goals/' + id, body),
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
