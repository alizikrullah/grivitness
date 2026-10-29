import { useMutation } from '@tanstack/react-query';

import { api, unwrap } from '@/lib/api';
import { multipartHeaders } from '@/services/food.service';
import type { WorkoutScanResult } from '@/types';

/**
 * Membaca screenshot aplikasi jam atau aplikasi lari jadi isian form
 * olahraga. Padanan mobile. Tidak menyimpan apa pun: hasilnya mengisi form,
 * user memeriksa lalu menyimpan lewat useCreateWorkout biasa.
 *
 * Dipisah dari workouts.service (salinan bersama dengan mobile) karena cara
 * mengirim berkas berbeda: di sini File dari input, dan Content-Type
 * dikosongkan supaya browser menambahkan boundary.
 */
export const useScanWorkout = () =>
  useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      for (const file of files) form.append('images', file);

      return unwrap<WorkoutScanResult>(
        api.post('/api/workouts/scan', form, {
          headers: multipartHeaders,
          // Membaca gambar lewat model bisa sampai belasan detik.
          timeout: 90_000,
        }),
      );
    },
  });
