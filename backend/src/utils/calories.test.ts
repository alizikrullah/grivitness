import { describe, expect, it } from 'vitest';

import {
  baselineTDEE,
  calculateAge,
  calculateBMR,
  calculateTDEE,
  caloriesFromSteps,
  caloriesFromWorkout,
  calorieFloor,
  daysBetween,
  distanceFromSteps,
  netKcalPerMinuteAt70,
  planWeightChange,
  restingPartitionPAL,
  safeWeeklyLossKg,
} from './calories.js';

describe('calculateAge', () => {
  it('menghitung usia dari tanggal lahir', () => {
    expect(calculateAge('1996-08-22', new Date('2026-08-22T00:00:00Z'))).toBe(30);
  });

  /** Kesalahan klasik: pakai selisih tahun saja, jadi kelebihan satu. */
  it('mengurangi satu kalau ulang tahun belum lewat tahun ini', () => {
    expect(calculateAge('1996-12-31', new Date('2026-08-22T00:00:00Z'))).toBe(29);
  });

  it('tepat bertambah pada hari ulang tahunnya', () => {
    expect(calculateAge('1996-08-21', new Date('2026-08-21T00:00:00Z'))).toBe(30);
    expect(calculateAge('1996-08-23', new Date('2026-08-22T00:00:00Z'))).toBe(29);
  });
});

describe('calculateBMR', () => {
  const dasar = { weightKg: 80, heightCm: 175, age: 30 };

  /** Mifflin-St Jeor pria: (10*80) + (6.25*175) - (5*30) + 5 = 1748.75 -> 1749 */
  it('memakai konstanta +5 untuk pria', () => {
    expect(calculateBMR({ ...dasar, gender: 'MALE' })).toBe(1749);
  });

  /** Wanita: (10*80) + (6.25*175) - (5*30) - 161 = 1582.75 -> 1583 */
  it('memakai konstanta -161 untuk wanita', () => {
    expect(calculateBMR({ ...dasar, gender: 'FEMALE' })).toBe(1583);
  });

  /**
   * OTHER memakai titik tengah kedua konstanta (-78). Bukan angka dari
   * literatur, tapi pilihan yang menghindari memaksa siapa pun masuk kategori
   * yang tidak sesuai. Hasilnya harus berada persis di antara keduanya.
   */
  it('menempatkan OTHER di antara pria dan wanita', () => {
    const pria = calculateBMR({ ...dasar, gender: 'MALE' });
    const wanita = calculateBMR({ ...dasar, gender: 'FEMALE' });
    const lain = calculateBMR({ ...dasar, gender: 'OTHER' });

    expect(lain).toBeLessThan(pria);
    expect(lain).toBeGreaterThan(wanita);
  });

  it('naik seiring berat dan tinggi, turun seiring usia', () => {
    const acuan = calculateBMR({ ...dasar, gender: 'MALE' });

    expect(calculateBMR({ ...dasar, weightKg: 90, gender: 'MALE' })).toBeGreaterThan(acuan);
    expect(calculateBMR({ ...dasar, heightCm: 185, gender: 'MALE' })).toBeGreaterThan(acuan);
    expect(calculateBMR({ ...dasar, age: 50, gender: 'MALE' })).toBeLessThan(acuan);
  });
});

describe('restingPartitionPAL', () => {
  const dasar = {
    activityLevel: 'SEDENTARY' as const,
    sleepMinutes: 480,
    steps: 0,
    workoutMinutes: 0,
  };

  /** 480 menit tidur (PAR 1.0) + 960 menit sisa (PAR 1.6), dibagi 1440. */
  it('membagi hari sesuai PAR tiap potongan', () => {
    expect(restingPartitionPAL(dasar)).toBeCloseTo((480 * 1.0 + 960 * 1.6) / 1440, 4);
  });

  it('memakai asumsi 8 jam ketika tidur belum dicatat', () => {
    expect(restingPartitionPAL({ ...dasar, sleepMinutes: null })).toBe(restingPartitionPAL(dasar));
  });

  /**
   * Jam berjalan dan olahraga PINDAH dari sisa hari ke potongan PAR 1.0, jadi
   * angka ini justru TURUN. Biaya kerjanya ditambahkan terpisah sebagai kalori
   * bersih. Inilah mekanisme yang membuat dobel hitung mustahil: satu jam cuma
   * bisa berada di satu potongan.
   */
  it('memindahkan jam aktif keluar dari sisa hari, bukan menambahkannya', () => {
    const diam = restingPartitionPAL(dasar);
    const aktif = restingPartitionPAL({ ...dasar, steps: 10_000, workoutMinutes: 60 });

    expect(aktif).toBeLessThan(diam);
  });

  it('makin berat pekerjaannya makin tinggi', () => {
    const level = [
      'SEDENTARY',
      'LIGHTLY_ACTIVE',
      'MODERATELY_ACTIVE',
      'VERY_ACTIVE',
      'EXTRA_ACTIVE',
    ] as const;

    const hasil = level.map((l) => restingPartitionPAL({ ...dasar, activityLevel: l }));

    expect(hasil).toEqual([...hasil].sort((a, b) => a - b));
  });

  /** Data mustahil tidak boleh membuat sisa hari negatif. */
  it('tidak meledak kalau potongan waktunya melebihi 24 jam', () => {
    const hasil = restingPartitionPAL({
      ...dasar,
      sleepMinutes: 20 * 60,
      steps: 60_000,
      workoutMinutes: 360,
    });

    expect(hasil).toBe(1);
  });
});

describe('calculateTDEE', () => {
  const dasar = {
    bmr: 1749,
    weightKg: 80,
    activityLevel: 'SEDENTARY' as const,
    sleepMinutes: 480,
    steps: 3000,
    workoutMinutes: 0,
    workoutCalories: 0,
  };

  it('menjumlahkan metabolisme, langkah, dan olahraga', () => {
    const hasil = calculateTDEE(dasar);

    expect(hasil.tdee).toBe(hasil.baseline + hasil.step_calories + hasil.workout_calories);
  });

  /**
   * PAL yang dilaporkan harus PAL sesungguhnya (TDEE/BMR), bukan potongan
   * istirahatnya. Kalau salah, angkanya tidak bisa dibandingkan dengan pita
   * FAO/WHO dan siapa pun yang mengeceknya akan tersesat.
   */
  it('melaporkan PAL sesungguhnya, bukan potongan istirahatnya', () => {
    const hasil = calculateTDEE(dasar);

    expect(hasil.pal).toBeCloseTo(hasil.tdee / dasar.bmr, 3);
    expect(hasil.pal).toBeGreaterThan(restingPartitionPAL(dasar));
  });

  /**
   * Hari kantor tanpa olahraga harus mendarat di pita "sedentary or light
   * activity lifestyle" FAO/WHO, yaitu 1.40 sampai 1.69. Ini kalibrasi yang
   * membenarkan nilai ACTIVITY_PAR — kalau meleset, seluruh angka TDEE ikut.
   */
  it('mendarat di pita sedentary FAO/WHO untuk hari kantor biasa', () => {
    const hasil = calculateTDEE(dasar);

    expect(hasil.pal).toBeGreaterThanOrEqual(1.4);
    expect(hasil.pal).toBeLessThanOrEqual(1.69);
  });

  /** Hari dengan 10.000 langkah dan 45 menit lari harus naik ke pita "moderat". */
  it('mendarat di pita moderat untuk hari yang benar-benar aktif', () => {
    const hasil = calculateTDEE({
      ...dasar,
      steps: 10_000,
      workoutMinutes: 45,
      workoutCalories: caloriesFromWorkout(netKcalPerMinuteAt70(8.3), 45, 80),
    });

    expect(hasil.pal).toBeGreaterThanOrEqual(1.7);
    expect(hasil.pal).toBeLessThanOrEqual(1.99);
  });

  /**
   * INI TES YANG PALING PENTING DI BERKAS INI.
   *
   * Menambahkan olahraga tidak boleh menaikkan TDEE sebesar kalori olahraganya
   * secara utuh. Jam olahraga itu MENGGANTIKAN jam sisa hari, jadi baseline-nya
   * ikut berkurang. Kalau kenaikannya sama persis dengan kalori olahraga, berarti
   * jam yang sama dibayar dua kali — persis bug yang metode ini dibuat untuk
   * menghapusnya.
   */
  it('tidak menghitung dua kali saat olahraga ditambahkan', () => {
    const tanpa = calculateTDEE(dasar);
    const dengan = calculateTDEE({ ...dasar, workoutMinutes: 60, workoutCalories: 400 });

    expect(dengan.tdee).toBeGreaterThan(tanpa.tdee);
    expect(dengan.tdee - tanpa.tdee).toBeLessThan(400);
    expect(dengan.baseline).toBeLessThan(tanpa.baseline);
  });

  it('sama untuk langkah — sebagian energinya sudah ada di sisa hari', () => {
    const sedikit = calculateTDEE({ ...dasar, steps: 0 });
    const banyak = calculateTDEE({ ...dasar, steps: 10_000 });

    const kalorLangkah = caloriesFromSteps(10_000, 80);

    expect(banyak.tdee).toBeGreaterThan(sedikit.tdee);
    expect(banyak.tdee - sedikit.tdee).toBeLessThan(kalorLangkah);
  });
});

describe('netKcalPerMinuteAt70', () => {
  /**
   * Regresi untuk bug yang sebenarnya: nilai MET dulu disalin mentah ke kolom
   * kkal/menit tanpa pernah dikonversi. Lari santai 8.3 MET tersimpan sebagai
   * "8.2 kkal/menit" padahal seharusnya (8.3-1) x 3.5 x 70 / 200 = 8.94.
   */
  it('mengubah MET jadi kalori bersih per menit untuk 70kg', () => {
    expect(netKcalPerMinuteAt70(8.3)).toBeCloseTo(8.94, 2);
    expect(netKcalPerMinuteAt70(3.0)).toBeCloseTo(2.45, 2);
  });

  /** Satu MET adalah metabolisme istirahat itu sendiri, jadi kerjanya nol. */
  it('menghasilkan nol untuk aktivitas setara istirahat', () => {
    expect(netKcalPerMinuteAt70(1.0)).toBe(0);
  });

  /**
   * Selalu di bawah nilai KOTOR-nya, dan selisihnya persis satu MET.
   *
   * Perhatikan bahwa hasilnya TIDAK selalu di bawah angka MET mentahnya —
   * di atas 5.44 MET justru melampauinya, karena pengali 1.225 tumbuh lebih
   * cepat daripada pengurangan satu MET. Itu juga berarti nilai library yang
   * lama (MET disalin mentah) tidak salah ke satu arah saja: olahraga ringan
   * dulu kelebihan, olahraga berat kekurangan.
   */
  it('selalu di bawah nilai kotornya, terpaut tepat satu MET', () => {
    for (const met of [2.3, 3.5, 5.0, 8.0, 12.3]) {
      const kotor = (met * 3.5 * 70) / 200;

      expect(netKcalPerMinuteAt70(met)).toBeLessThan(kotor);
      // Presisi satu angka: nilai simpannya dibulatkan ke dua desimal, jadi
      // selisihnya boleh meleset sampai setengah satuan terakhir.
      expect(kotor - netKcalPerMinuteAt70(met)).toBeCloseTo((3.5 * 70) / 200, 1);
    }
  });

  it('naik secara monoton terhadap MET', () => {
    const hasil = [2.3, 3.5, 5.0, 8.0, 12.3].map(netKcalPerMinuteAt70);

    expect(hasil).toEqual([...hasil].sort((a, b) => a - b));
  });
});

describe('estimasi dari langkah', () => {
  /** 10.000 x 80 x 0.00035 = 280 kkal bersih. */
  it('menghitung kalori bersih dari langkah dan berat badan', () => {
    expect(caloriesFromSteps(10_000, 80)).toBe(280);
  });

  /** Jarak diturunkan dari tinggi badan, bukan asumsi 80cm untuk semua orang. */
  it('menghitung jarak dari tinggi badan', () => {
    expect(distanceFromSteps(10_000, 175, 'MALE')).toBeCloseTo(7.263, 2);
    expect(distanceFromSteps(10_000, 155, 'FEMALE')).toBeCloseTo(6.402, 2);
  });

  it('yang lebih tinggi menempuh jarak lebih jauh dengan langkah yang sama', () => {
    expect(distanceFromSteps(10_000, 185, 'MALE')).toBeGreaterThan(
      distanceFromSteps(10_000, 160, 'MALE'),
    );
  });

  it('nol langkah berarti nol', () => {
    expect(caloriesFromSteps(0, 80)).toBe(0);
    expect(distanceFromSteps(0, 175, 'MALE')).toBe(0);
  });
});

describe('caloriesFromWorkout', () => {
  /** Nilai library adalah estimasi untuk 70kg, jadi 70kg tidak di-scale. */
  it('tidak mengubah nilai untuk berat 70kg', () => {
    expect(caloriesFromWorkout(10, 30, 70)).toBe(300);
  });

  it('menaikkan hasil untuk berat di atas 70kg', () => {
    expect(caloriesFromWorkout(10, 30, 90)).toBeGreaterThan(300);
  });

  it('menurunkan hasil untuk berat di bawah 70kg', () => {
    expect(caloriesFromWorkout(10, 30, 50)).toBeLessThan(300);
  });
});

describe('batas keamanan', () => {
  /** NHLBI: 1200-1600 kkal untuk pria, 1000-1200 untuk wanita. */
  it('membedakan batas bawah kalori menurut jenis kelamin', () => {
    expect(calorieFloor('MALE')).toBe(1500);
    expect(calorieFloor('FEMALE')).toBe(1200);
    expect(calorieFloor('OTHER')).toBeGreaterThan(calorieFloor('FEMALE'));
    expect(calorieFloor('OTHER')).toBeLessThan(calorieFloor('MALE'));
  });

  /** CDC dan NHLBI: 0,5-1 kg per minggu, dan tidak lebih dari 1% berat badan. */
  it('membatasi laju penurunan pada 1 kg atau 1% berat badan, mana yang lebih kecil', () => {
    expect(safeWeeklyLossKg(120)).toBe(1);
    expect(safeWeeklyLossKg(60)).toBe(0.6);
  });
});

describe('planWeightChange', () => {
  const dasar = {
    currentWeightKg: 85,
    targetWeightKg: 80,
    heightCm: 175,
    age: 30,
    gender: 'MALE' as const,
    activityLevel: 'SEDENTARY' as const,
  };

  /**
   * Target yang wajar harus benar-benar mendarat di berat target — dibuktikan
   * dengan menjalankan simulasinya kembali, bukan dengan mempercayai rumusnya.
   */
  it('menemukan asupan yang mencapai target tepat waktu', () => {
    const hasil = planWeightChange({ ...dasar, daysRemaining: 120 });

    expect(hasil.achievable).toBe(true);
    expect(hasil.daily_deficit).toBeGreaterThan(0);
    expect(hasil.projected_days).toBe(120);
    expect(hasil.extra_steps_needed).toBe(0);
  });

  /**
   * Inti perbaikan atas kaidah 7700 linear: TDEE dihitung ulang dari berat badan
   * hari itu di setiap langkah. Karena badan makin ringan makin sedikit membakar,
   * defisit yang dibutuhkan per hari lebih BESAR daripada hasil pembagian sekali
   * jalan yang mengasumsikan TDEE diam saja.
   */
  it('menuntut defisit lebih besar daripada kaidah linear yang mengabaikan turunnya TDEE', () => {
    const hari = 120;
    const hasil = planWeightChange({ ...dasar, daysRemaining: hari });

    const linear = ((dasar.currentWeightKg - dasar.targetWeightKg) * 7700) / hari;

    expect(hasil.required_deficit).toBeGreaterThan(linear);
  });

  /**
   * Bagian terpenting: target yang mustahil TIDAK boleh menghasilkan anjuran
   * berbahaya. Budget ditahan di batas aman, achievable memberi tahu user bahwa
   * targetnya tidak realistis, dan tanggal yang sebenarnya tetap dihitung.
   */
  it('menahan budget di batas aman untuk target yang terlalu agresif', () => {
    const hasil = planWeightChange({
      ...dasar,
      currentWeightKg: 90,
      targetWeightKg: 70,
      daysRemaining: 14,
    });

    expect(hasil.achievable).toBe(false);
    expect(hasil.daily_calorie_budget).toBeGreaterThanOrEqual(calorieFloor('MALE'));
    expect(hasil.required_deficit).toBeGreaterThan(hasil.daily_deficit);
    expect(hasil.weekly_rate_kg).toBeLessThanOrEqual(hasil.safe_weekly_rate_kg + 0.01);
    // Tanggal realistisnya tetap dilaporkan, jauh di belakang tanggal yang diminta.
    expect(hasil.projected_days).toBeGreaterThan(14);
  });

  /** Defisit yang tidak boleh datang dari makanan dialihkan jadi anjuran langkah. */
  it('mengubah sisa defisit jadi langkah tambahan', () => {
    const hasil = planWeightChange({
      ...dasar,
      currentWeightKg: 90,
      targetWeightKg: 78,
      daysRemaining: 60,
    });

    expect(hasil.achievable).toBe(false);
    expect(hasil.extra_steps_needed).toBeGreaterThan(0);
  });

  it('menghasilkan surplus untuk target menaikkan berat badan', () => {
    const hasil = planWeightChange({
      ...dasar,
      currentWeightKg: 60,
      targetWeightKg: 65,
      daysRemaining: 120,
    });

    expect(hasil.daily_deficit).toBeLessThan(0);
    expect(hasil.daily_calorie_budget).toBeGreaterThan(hasil.tdee);
    expect(hasil.extra_steps_needed).toBe(0);
  });

  /** Tanggal target hari ini juga: jangan sampai membagi dengan nol. */
  it('tidak meledak saat sisa hari nol', () => {
    const hasil = planWeightChange({ ...dasar, daysRemaining: 0 });

    expect(Number.isFinite(hasil.daily_calorie_budget)).toBe(true);
    expect(hasil.daily_calorie_budget).toBeGreaterThanOrEqual(calorieFloor('MALE'));
  });

  it('tidak menyuruh defisit saat berat sudah sama dengan target', () => {
    const hasil = planWeightChange({ ...dasar, targetWeightKg: 85, daysRemaining: 30 });

    expect(hasil.daily_deficit).toBeCloseTo(0, 0);
    expect(hasil.achievable).toBe(true);
  });
});

describe('baselineTDEE', () => {
  /** Harus stabil: tidak bergantung pada aktivitas hari itu sama sekali. */
  it('memberi angka yang sama untuk profil yang sama', () => {
    expect(baselineTDEE(1749, 80, 'SEDENTARY')).toBe(baselineTDEE(1749, 80, 'SEDENTARY'));
  });

  it('naik seiring beratnya pekerjaan', () => {
    expect(baselineTDEE(1749, 80, 'VERY_ACTIVE')).toBeGreaterThan(
      baselineTDEE(1749, 80, 'SEDENTARY'),
    );
  });
});

describe('daysBetween', () => {
  it('menghitung selisih hari', () => {
    expect(daysBetween('2026-08-22', '2026-09-01')).toBe(10);
  });

  it('tanggal yang sama berarti nol', () => {
    expect(daysBetween('2026-08-22', '2026-08-22')).toBe(0);
  });

  it('negatif kalau tanggal tujuan sudah lewat', () => {
    expect(daysBetween('2026-08-22', '2026-08-12')).toBe(-10);
  });
});
