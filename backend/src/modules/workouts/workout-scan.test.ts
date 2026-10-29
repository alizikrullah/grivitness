import { describe, expect, it } from 'vitest';

import { normalisasiScan, type PilihanLibrary, workoutScanPrompt } from './workout-scan.js';

const PILIHAN: PilihanLibrary[] = [
  { id: 'lari', name: 'Lari', measure: 'TIME', distance_kind: 'RUN' },
  { id: 'jalan', name: 'Jalan', measure: 'TIME', distance_kind: 'WALK' },
  { id: 'renang', name: 'Renang', measure: 'TIME', distance_kind: null },
];

const HARI_INI = '2026-10-29';
const BMR = 1876;

/** Yang dibaca model dari screenshot Huawei Health pemiliknya, 28 Okt 2026. */
const HUAWEI = {
  activity: 'Outdoor run',
  library_index: 1,
  date: '2026-10-28',
  start_time: '04:51',
  duration_seconds: 2685,
  distance_km: 3.92,
  pace_seconds_per_km: 684,
  avg_hr: 156,
  max_hr: null,
  avg_cadence: 140,
  steps: 6273,
  elevation_gain_m: null,
  total_kcal: 360,
  active_kcal: 289,
  training_effect: 3.1,
};

describe('normalisasiScan', () => {
  it('screenshot lari Huawei terbaca utuh, kalori yang dipakai TOTAL', () => {
    const hasil = normalisasiScan(HUAWEI, PILIHAN, HARI_INI, BMR);

    expect(hasil).toMatchObject({
      workout_library_id: 'lari',
      workout_name: 'Lari',
      activity_label: 'Outdoor run',
      distance_kind: 'RUN',
      logged_at: '2026-10-28',
      started_at: '2026-10-28T04:51:00+07:00',
      duration_seconds: 2685,
      distance_km: 3.92,
      pace_seconds_per_km: 684,
      avg_hr: 156,
      avg_cadence: 140,
      step_count: 6273,
      training_effect: 3.1,
      calories_total: 360,
    });
    // 684 x 3,92 = 2.681 detik, cocok dengan 2.685.
    expect(hasil.warnings).toEqual([]);
  });

  it('pace yang tidak tertulis diturunkan dari durasi dan jarak', () => {
    const hasil = normalisasiScan({ ...HUAWEI, pace_seconds_per_km: null }, PILIHAN, HARI_INI, BMR);
    expect(hasil.pace_seconds_per_km).toBe(685);
  });

  it('pace x jarak lebih lama dari durasi itu salah baca, diberi peringatan', () => {
    const hasil = normalisasiScan({ ...HUAWEI, pace_seconds_per_km: 784 }, PILIHAN, HARI_INI, BMR);
    expect(hasil.warnings).toHaveLength(1);
    expect(hasil.warnings[0]).toContain('tidak cocok');
  });

  it('cuma kalori aktif: istirahat selama sesi ditambahkan dari BMR', () => {
    const hasil = normalisasiScan({ ...HUAWEI, total_kcal: null }, PILIHAN, HARI_INI, BMR);
    // 289 + 1.876 / 1.440 x 44,75 menit = 289 + 58
    expect(hasil.calories_total).toBe(347);
  });

  it('tanggal yang belum terjadi tidak dipakai', () => {
    const hasil = normalisasiScan({ ...HUAWEI, date: '2026-11-02' }, PILIHAN, HARI_INI, BMR);
    expect(hasil.logged_at).toBeNull();
    expect(hasil.started_at).toBeNull();
    expect(hasil.warnings[0]).toContain('belum terjadi');
  });

  it('nomor library di luar daftar dan angka mustahil dibuang', () => {
    const hasil = normalisasiScan(
      { ...HUAWEI, activity: 'Elliptical', library_index: 9, avg_hr: 900, distance_km: 'abc' },
      PILIHAN,
      HARI_INI,
      BMR,
    );
    expect(hasil.workout_library_id).toBeNull();
    expect(hasil.workout_name).toBe('Elliptical');
    expect(hasil.avg_hr).toBeNull();
    expect(hasil.distance_km).toBeNull();
    expect(hasil.warnings.some((w) => w.includes('Elliptical'))).toBe(true);
  });

  it('prompt menyebut daftar olahraga bernomor dan tanggal hari ini', () => {
    const prompt = workoutScanPrompt(PILIHAN, HARI_INI);
    expect(prompt).toContain('1. Lari');
    expect(prompt).toContain('3. Renang');
    expect(prompt).toContain(`Today is ${HARI_INI}`);
  });
});
