import { describe, expect, it } from 'vitest';

import { type OverviewDay, type OverviewInput, susunOverview } from './overview.js';

/** Satu hari yang "baik-baik saja", tiap tes cukup mengubah yang dibahasnya. */
const hari = (date: string, ubah: Partial<OverviewDay> = {}): OverviewDay => ({
  date,
  calories_in: 1900,
  incomplete: false,
  calories_out: 2800,
  protein_g: 160,
  sugar_g: 30,
  water_ml: 3600,
  water_target_ml: 3800,
  steps: null,
  workout_minutes: 30,
  ...ubah,
});

const TANGGAL = [
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-03',
];

/** Kasus pemiliknya, 4 Okt 2026: jatah 1.958, protein 171 g, gula 49 g. */
const input = (ubah: Partial<OverviewInput> = {}): OverviewInput => ({
  today: '2026-10-04',
  days: TANGGAL.map((t) => hari(t)),
  sugarToday: 24,
  nights: [
    { date: '2026-09-30', minutes: 450 },
    { date: '2026-10-01', minutes: 470 },
    { date: '2026-10-04', minutes: 440 },
  ],
  sleepTarget: { min_minutes: 420, max_minutes: 540 },
  stepTarget: 6000,
  proteinTarget: 171,
  sugarMax: 49,
  budget: 1958,
  weights: [],
  plannedWeeklyRate: 0.95,
  losing: true,
  ...ubah,
});

const cari = (o: ReturnType<typeof susunOverview>, key: string) =>
  [...o.improve, ...o.good].find((i) => i.key === key);

describe('susunOverview', () => {
  it('gula hari ini diteruskan apa adanya bersama batasnya', () => {
    expect(susunOverview(input({ sugarToday: 24.04 })).sugar_today).toEqual({
      grams: 24,
      max_g: 49,
    });
  });

  it('minggu yang baik masuk "sudah bagus" semua, olahraga 210 menit cukup menurut WHO', () => {
    const o = susunOverview(input());

    expect(o.improve).toEqual([]);
    expect(o.good.map((i) => i.key)).toEqual([
      'calories',
      'protein',
      'sleep',
      'water',
      'sugar',
      'workout',
    ]);
    expect(cari(o, 'calories')?.detail).toContain('Defisit rata-rata 900 kkal per hari');
  });

  describe('tidur', () => {
    it('di bawah enam jam merah, menyebut kurangnya dan semalam', () => {
      const item = cari(
        susunOverview(
          input({
            nights: [
              { date: '2026-10-02', minutes: 340 },
              { date: '2026-10-03', minutes: 300 },
              { date: '2026-10-04', minutes: 260 },
            ],
          }),
        ),
        'sleep',
      );

      expect(item?.tone).toBe('bad');
      expect(item?.title).toBe('Tidur kurang');
      expect(item?.value).toBe('5j');
      expect(item?.detail).toBe(
        'Rata-rata dari 3 malam tercatat, kurang 2j dari 7 jam. Semalam 4j 20m.',
      );
    });

    it('enam sampai tujuh jam oranye', () => {
      const item = cari(
        susunOverview(
          input({
            nights: [
              { date: '2026-10-03', minutes: 400 },
              { date: '2026-10-04', minutes: 380 },
            ],
          }),
        ),
        'sleep',
      );
      expect(item?.tone).toBe('warn');
    });

    it('satu malam tercatat belum cukup untuk dinilai', () => {
      const o = susunOverview(input({ nights: [{ date: '2026-10-04', minutes: 200 }] }));
      expect(cari(o, 'sleep')).toBeUndefined();
    });
  });

  it('kurang minum dihitung dari hari yang dicatat saja, terhadap target harinya', () => {
    const days = TANGGAL.map((t, i) =>
      hari(t, { water_ml: i < 3 ? 0 : 1300, water_target_ml: 3800 }),
    );
    const item = cari(susunOverview(input({ days })), 'water');

    expect(item?.tone).toBe('bad');
    expect(item?.value).toBe('1,3 L');
    expect(item?.detail).toBe(
      'Rata-rata per hari dari target sekitar 3,8 L (4 hari tercatat). Kemarin 1,3 L.',
    );
  });

  it('protein mengabaikan hari yang ditandai belum lengkap', () => {
    const days = TANGGAL.map((t, i) =>
      i === 6 ? hari(t, { protein_g: 10, incomplete: true }) : hari(t, { protein_g: 72 }),
    );
    const item = cari(susunOverview(input({ days })), 'protein');

    expect(item?.tone).toBe('bad');
    expect(item?.value).toBe('72 g');
    // Kemarin ditandai belum lengkap, jadi tidak disebut.
    expect(item?.detail).toBe('Rata-rata per hari dari target 171 g, kurang 99 g.');
  });

  it('tanpa jatah aktif, protein dan kalori tidak dinilai', () => {
    const o = susunOverview(input({ budget: null, proteinTarget: null }));
    expect(cari(o, 'protein')).toBeUndefined();
    expect(cari(o, 'calories')).toBeUndefined();
  });

  describe('kalori', () => {
    it('kemarin lewat jatah lebih dari 100 kkal', () => {
      const days = TANGGAL.map((t, i) => hari(t, i === 6 ? { calories_in: 2400 } : {}));
      const item = cari(susunOverview(input({ days })), 'calories');

      expect(item?.tone).toBe('warn');
      expect(item?.title).toBe('Kemarin lewat jatah');
      expect(item?.value).toBe('+442 kkal');
    });

    it('lewat 50 kkal masih dalam kelonggaran', () => {
      const days = TANGGAL.map((t, i) => hari(t, i === 6 ? { calories_in: 2008 } : {}));
      expect(cari(susunOverview(input({ days })), 'calories')?.tone).toBe('good');
    });

    it('rata-rata jauh di bawah jatah diberi tanda', () => {
      const days = TANGGAL.map((t) => hari(t, { calories_in: 1300 }));
      const item = cari(susunOverview(input({ days })), 'calories');

      expect(item?.title).toBe('Makan jauh di bawah jatah');
      expect(item?.detail).toContain('658 di bawah jatah 1.958');
    });
  });

  describe('gula', () => {
    it('kemarin lewat batas, merah kalau lebih dari 1,5 kali', () => {
      const days = TANGGAL.map((t, i) => hari(t, i === 6 ? { sugar_g: 80 } : {}));
      const item = cari(susunOverview(input({ days })), 'sugar');

      expect(item?.tone).toBe('bad');
      expect(item?.title).toBe('Gula kemarin lewat batas');
      expect(item?.progress).toBe(1.63);
    });

    it('sering lewat batas walau kemarin aman', () => {
      const days = TANGGAL.map((t, i) => hari(t, i < 3 ? { sugar_g: 60 } : {}));
      expect(cari(susunOverview(input({ days })), 'sugar')?.title).toBe('Gula sering lewat batas');
    });
  });

  describe('olahraga', () => {
    it('di bawah 150 menit seminggu menyebut kurangnya', () => {
      const days = TANGGAL.map((t, i) => hari(t, { workout_minutes: i < 2 ? 48 : 0 }));
      const item = cari(susunOverview(input({ days })), 'workout');

      expect(item?.tone).toBe('warn');
      expect(item?.value).toBe('1j 36m');
      expect(item?.detail).toContain('kurang 54m');
    });

    it('nol menit tetap dinilai', () => {
      const days = TANGGAL.map((t) => hari(t, { workout_minutes: 0 }));
      expect(cari(susunOverview(input({ days })), 'workout')?.title).toBe('Belum ada olahraga');
    });
  });

  it('langkah tidak dibahas kalau tidak pernah dicatat, dan tidak pernah merah', () => {
    expect(cari(susunOverview(input()), 'steps')).toBeUndefined();

    const days = TANGGAL.map((t) => hari(t, { steps: 1000 }));
    expect(cari(susunOverview(input({ days })), 'steps')?.tone).toBe('warn');
  });

  it('catatan makan di bawah lima hari ditandai bolong', () => {
    const days = TANGGAL.map((t, i) => hari(t, i < 3 ? { calories_in: null } : {}));
    const item = cari(susunOverview(input({ days })), 'food_log');

    expect(item?.value).toBe('4 dari 7 hari');
  });

  describe('berat', () => {
    const turun = [
      { date: '2026-09-27', kg: 96.6 },
      { date: '2026-09-29', kg: 96.3 },
      { date: '2026-10-01', kg: 96.0 },
      { date: '2026-10-04', kg: 95.4 },
    ];

    it('tren turun lewat regresi, dengan laju rencananya', () => {
      const item = cari(susunOverview(input({ weights: turun })), 'weight');

      expect(item?.tone).toBe('good');
      expect(item?.title).toBe('Berat turun');
      expect(item?.value).toBe('1,2 kg/minggu');
      expect(item?.detail).toContain('rencana 1,0 kg per minggu');
    });

    it('naik untuk target turun jadi catatan, datar juga', () => {
      const naik = turun.map((w, i) => ({ ...w, kg: 95 + i * 0.3 }));
      expect(cari(susunOverview(input({ weights: naik })), 'weight')?.title).toBe('Berat naik');

      const datar = turun.map((w) => ({ ...w, kg: 95.4 }));
      expect(cari(susunOverview(input({ weights: datar })), 'weight')?.title).toBe('Berat datar');
    });

    it('penimbangan yang terlalu sedikit atau terlalu rapat tidak dinilai', () => {
      expect(cari(susunOverview(input({ weights: turun.slice(0, 3) })), 'weight')).toBeUndefined();

      const rapat = [
        { date: '2026-10-01', kg: 96 },
        { date: '2026-10-02', kg: 95.8 },
        { date: '2026-10-03', kg: 95.7 },
        { date: '2026-10-04', kg: 95.4 },
      ];
      expect(cari(susunOverview(input({ weights: rapat })), 'weight')).toBeUndefined();
    });
  });

  it('merah selalu di atas oranye, lalu menurut urutan kepentingan', () => {
    const days = TANGGAL.map((t) =>
      hari(t, { protein_g: 120, water_ml: 1000, workout_minutes: 0 }),
    );
    const o = susunOverview(input({ days }));

    // Air 26% target (merah) naik ke atas protein 70% (oranye).
    expect(o.improve.map((i) => [i.key, i.tone])).toEqual([
      ['water', 'bad'],
      ['protein', 'warn'],
      ['workout', 'warn'],
    ]);
  });
});
