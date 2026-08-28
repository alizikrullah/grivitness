import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { del, get, patch, post } from '@/lib/api';
import { invalidateAfterLog, qk } from '@/lib/query';
import { todayWIB } from '@/utils/date';
import type {
  CustomWorkout,
  WorkoutCategory,
  WorkoutDay,
  WorkoutIntensity,
  WorkoutLibraryItem,
  WorkoutLog,
} from '@/types';

/**
 * Sumber olahraga menentukan siapa yang menghitung kalorinya.
 *
 * Kalau dipilih dari library atau custom workout, backend yang menghitung dari
 * durasi dan berat badan user, nilai calories_burned yang dikirim client akan
 * diabaikan. Hanya input manual yang wajib menyertakan nama dan kalorinya.
 */
export interface WorkoutInput {
  workout_library_id?: string;
  custom_workout_id?: string;
  workout_name?: string;
  duration_minutes: number;
  calories_burned?: number;
  intensity: WorkoutIntensity;
  /**
   * true kalau sesi ini sudah ikut terhitung di angka smartwatch hari itu.
   *
   * Menentukan apakah kalorinya boleh ditambahkan di atas angka perangkat.
   * Jalan santai sambil memakai jam sudah masuk di sana; berenang belum.
   */
  tracked_by_device?: boolean;
  notes?: string;
  logged_at?: string;
}

export const useWorkoutsToday = () =>
  useQuery({ queryKey: qk.workoutsToday, queryFn: () => get<WorkoutDay>('/api/workouts/today') });

export const useWorkoutsRange = (from: string, to: string) =>
  useQuery({
    queryKey: qk.workoutsRange(from, to),
    queryFn: () => get<WorkoutLog[]>('/api/workouts', { params: { from, to } }),
  });

/**
 * Olahraga pada satu tanggal, dipakai layar catat untuk menelusuri hari lampau.
 *
 * Untuk hari ini permintaannya dialihkan ke endpoint dan kunci cache "today",
 * supaya layar catat dan beranda berbagi satu salinan data. Tanpa itu hal yang
 * sama tersimpan dua kali dengan kunci berbeda, dan salah satunya pasti basi.
 */
export const useWorkoutsDate = (date: string) => {
  const iniHariIni = date === todayWIB();

  return useQuery({
    queryKey: iniHariIni ? qk.workoutsToday : qk.workoutsDate(date),
    queryFn: () =>
      iniHariIni
        ? get<WorkoutDay>('/api/workouts/today')
        : get<WorkoutDay>('/api/workouts/day', { params: { date } }),
  });
};

export const useWorkoutLibrary = (category?: WorkoutCategory, search?: string) =>
  useQuery({
    queryKey: qk.workoutLibrary(category, search),
    queryFn: () =>
      get<WorkoutLibraryItem[]>('/api/workouts/library', {
        params: { category, search: search || undefined },
      }),
    // Library global jarang berubah, jadi tidak perlu sering diambil ulang.
    staleTime: 30 * 60_000,
  });

export const useCustomWorkouts = () =>
  useQuery({
    queryKey: qk.customWorkouts,
    queryFn: () => get<CustomWorkout[]>('/api/workouts/custom'),
  });

const segarkan = (client: ReturnType<typeof useQueryClient>) => {
  void client.invalidateQueries({ queryKey: ['workouts'] });
  invalidateAfterLog(client);
};

export const useCreateWorkout = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: WorkoutInput) => post<WorkoutLog>('/api/workouts', body),
    onSuccess: () => segarkan(client),
  });
};

export const useDeleteWorkout = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/workouts/' + id),
    onSuccess: () => segarkan(client),
  });
};

export const useCreateCustomWorkout = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      name: string;
      category: WorkoutCategory;
      calories_burned_per_minute: number;
      description?: string;
    }) => post<CustomWorkout>('/api/workouts/custom', body),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.customWorkouts }),
  });
};

export const useDeleteCustomWorkout = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => del('/api/workouts/custom/' + id),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.customWorkouts }),
  });
};

export interface WorkoutEditInput {
  id: string;
  workout_name?: string;
  duration_minutes?: number;
  calories_burned?: number;
  intensity?: WorkoutIntensity;
  tracked_by_device?: boolean;
  notes?: string | null;
}

export const useUpdateWorkout = () => {
  const client = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: WorkoutEditInput) =>
      patch<WorkoutLog>('/api/workouts/' + id, body),
    onSuccess: () => segarkan(client),
  });
};
