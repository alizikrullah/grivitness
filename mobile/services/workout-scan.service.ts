import { useMutation } from '@tanstack/react-query';

import { api, unwrap } from '@/lib/api';
import { asFilePart } from '@/services/food.service';
import type { WorkoutScanResult } from '@/types';

/**
 * Membaca screenshot aplikasi jam atau aplikasi lari jadi isian form
 * olahraga. Tidak menyimpan apa pun: hasilnya mengisi form, user memeriksa
 * lalu menyimpan lewat useCreateWorkout biasa.
 *
 * Dipisah dari workouts.service (salinan bersama dengan web) karena cara
 * mengirim berkas berbeda: React Native memakai objek uri, browser memakai
 * File dan membiarkan Content-Type kosong.
 */
export const useScanWorkout = () =>
  useMutation({
    mutationFn: (uris: string[]) => {
      const form = new FormData();
      for (const uri of uris) form.append('images', asFilePart(uri));

      return unwrap<WorkoutScanResult>(
        api.post('/api/workouts/scan', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          // Membaca gambar lewat model bisa sampai belasan detik.
          timeout: 90_000,
        }),
      );
    },
  });
