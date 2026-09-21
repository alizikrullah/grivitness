import { describe, expect, it } from 'vitest';

import type { DailySummary, HistorySummary, PeriodSummary } from '../summary/summary.service.js';
import { rapikanBalasan, susunFakta } from './chat.service.js';

/**
 * Lembar fakta adalah satu-satunya yang dilihat model tentang user, jadi
 * kalimatnya diuji langsung: nilai kosong harus terbaca "belum dicatat", jam
 * harus ikut, dan target berat harus sampai ke model.
 */

const harian = (ubah: Partial<DailySummary> = {}): DailySummary => ({
  date: '2026-09-21',
  weight_kg: 96,
  calories_in: 0,
  calories_out: 2660,
  device_kcal: null,
  calories_out_source: 'formula',
  calorie_budget: 1995,
  calories_remaining: 1995,
  energy: null,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  steps: 0,
  water_ml: 0,
  sleep_minutes: 0,
  workout_minutes: 0,
  workout_calories: 0,
  mood_score: null,
  energy_score: null,
  has_body_photo: false,
  targets: {
    water_ml: 3350,
    sleep: { min_minutes: 420, max_minutes: 540 },
    steps: { steps: 8000, custom: false },
    macros: { protein_g: 173, carbs_g: 153, fat_g: 77 },
  },
  ...ubah,
});

const pekan: PeriodSummary = {
  from: '2026-09-15',
  to: '2026-09-21',
  days: 7,
  weight_start: 96,
  weight_end: 96,
  weight_change_kg: 0,
  total_calories_in: 300,
  avg_calories_in: 300,
  total_steps: 0,
  avg_steps: 0,
  total_water_ml: 0,
  total_sleep_minutes: 0,
  avg_sleep_minutes: 0,
  total_workout_minutes: 0,
  total_workout_calories: 0,
  days_logged: 1,
  avg_device_kcal: null,
};

const riwayat = (summary: Partial<HistorySummary['summary']> = {}): HistorySummary => ({
  from: '2026-09-15',
  to: '2026-09-21',
  days: [],
  summary: {
    days_logged: 0,
    avg_calories_in: 0,
    avg_calories_out: 0,
    avg_balance: 0,
    deficit_days: 0,
    ...summary,
  },
});

describe('susunFakta', () => {
  it('menyebut jam WIB, karena nol di pagi hari bukan nol di malam hari', () => {
    const fakta = susunFakta(harian(), pekan, riwayat(), null, null, null, null, '06.12');
    expect(fakta).toContain('Sekarang: 2026-09-21 pukul 06.12 WIB.');
  });

  it('menulis "belum dicatat" untuk nilai kosong, bukan angka nol', () => {
    const fakta = susunFakta(harian(), pekan, riwayat(), null, null, null, null, '06.12');

    expect(fakta).toContain('Belum ada catatan makan hari ini.');
    expect(fakta).toContain('Langkah belum dicatat.');
    expect(fakta).toContain('Minum belum dicatat.');
    expect(fakta).toContain('Tidur belum dicatat.');
    expect(fakta).not.toContain('Tidur 0 jam');
    expect(fakta).not.toContain('Minum 0 ml');
    expect(fakta).toContain('Berat tetap di 96 kg.');
    expect(fakta).not.toContain('tetap 0 kg');
  });

  it('menulis angkanya kalau memang ada', () => {
    const fakta = susunFakta(
      harian({ calories_in: 300, protein_g: 20, steps: 4200, water_ml: 1500, sleep_minutes: 450 }),
      pekan,
      riwayat(),
      null,
      null,
      null,
      null,
      '13.00',
    );

    expect(fakta).toContain('Kalori masuk 300 kkal, protein 20 g');
    expect(fakta).toContain('Langkah 4.200.');
    expect(fakta).toContain('Minum 1.500 ml.');
    expect(fakta).toContain('Tidur 7 jam 30 menit.');
  });

  it('mengirim target berat dan rencananya, termasuk saat targetnya tidak realistis', () => {
    const fakta = susunFakta(
      harian(),
      pekan,
      riwayat(),
      null,
      {
        id: 'g1',
        user_id: 'u1',
        target_weight_kg: '85.00',
        target_date: '2027-01-19',
        daily_calorie_budget: 1995,
        is_active: true,
        created_at: null,
        updated_at: null,
        current_weight_kg: 96,
        remaining_kg: 11,
        days_remaining: 120,
        tdee: 2660,
        achievable: false,
        observed_tdee: null,
        plan: {
          daily_calorie_budget: 1995,
          daily_deficit: 665,
          required_deficit: 780,
          achievable: false,
          tdee: 2660,
          weekly_rate_kg: 0.6,
          safe_weekly_rate_kg: 0.96,
          projected_days: 145,
          extra_steps_needed: 3600,
        },
      },
      null,
      null,
      '06.12',
    );

    expect(fakta).toContain('Target 85 kg pada 2027-01-19, sisa 120 hari.');
    expect(fakta).toContain('Masih 11 kg lagi.');
    expect(fakta).toContain('defisit 665 kkal per hari, laju 0.6 kg per minggu');
    expect(fakta).toContain('TIDAK tercapai');
    expect(fakta).toContain('145 hari dari sekarang');
    expect(fakta).toContain('tambah 3.600 langkah per hari');
  });

  it('menyebut defisit mingguan dari hari tercatat saja, sama dengan halaman riwayat', () => {
    const fakta = susunFakta(
      harian(),
      pekan,
      riwayat({
        days_logged: 5,
        avg_calories_in: 1800,
        avg_calories_out: 2400,
        avg_balance: 600,
        deficit_days: 4,
      }),
      null,
      null,
      null,
      null,
      '06.12',
    );

    expect(fakta).toContain(
      'Dari 5 hari yang makannya tercatat: rata-rata masuk 1.800 kkal, keluar 2.400 kkal, defisit rata-rata 600 kkal per hari. Defisit pada 4 dari 5 hari itu.',
    );
  });

  it('menyebut apa yang sudah dimakan hari ini, per sesi', () => {
    const fakta = susunFakta(
      harian({ calories_in: 300, protein_g: 20 }),
      pekan,
      riwayat(),
      null,
      null,
      {
        date: '2026-09-21',
        total_calories: 300,
        total_protein_g: 20,
        total_carbs_g: 0,
        total_fat_g: 0,
        logs: [
          {
            id: 'f1',
            user_id: 'u1',
            directus_file_id: null,
            meal_type: 'BREAKFAST',
            ai_analysis: {
              items: [
                { name: 'Roti gandum', portions: 2 },
                { name: 'Telur rebus', portions: 1 },
              ],
            },
            total_calories: 300,
            protein_g: '20.00',
            carbs_g: '0.00',
            fat_g: '0.00',
            logged_at: '2026-09-21T00:30:00.000Z',
            created_at: null,
            photo_url: null,
          },
        ],
      },
      null,
      '06.12',
    );

    expect(fakta).toContain('- Sarapan: Roti gandum 2 porsi, Telur rebus (300 kkal, protein 20 g)');
  });
});

describe('rapikanBalasan', () => {
  it('mengganti simbol matematika yang tetap dipakai model walau dilarang', () => {
    expect(rapikanBalasan('Dada ayam 200 g \u2192 protein \u2248 62 g, \u2248 220 kcal')).toBe(
      'Dada ayam 200 g: protein sekitar 62 g, sekitar 220 kkal',
    );
  });

  it('memakan spasi tak-terputus di belakang simbol dan spasi di ujung baris', () => {
    expect(rapikanBalasan('protein \u2248\u00a062 g  \nkalori \u2192\u00a0220')).toBe(
      'protein sekitar 62 g\nkalori: 220',
    );
  });

  it('menyatukan ribuan yang dipisah spasi tanpa menyentuh angka lain', () => {
    expect(rapikanBalasan('sisa 1 695 kcal dari jatah 1 995, 120 hari, 2 telur, 100 g')).toBe(
      'sisa 1.695 kkal dari jatah 1.995, 120 hari, 2 telur, 100 g',
    );
  });

  it('tetap membersihkan tanda pisah dan markdown seperti sebelumnya', () => {
    expect(rapikanBalasan('**Protein** 30\u201340 g \u2014 cukup\n\u2014 telur')).toBe(
      'Protein 30-40 g, cukup\n- telur',
    );
  });
});
