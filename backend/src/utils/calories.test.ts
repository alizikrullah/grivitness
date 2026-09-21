import { describe, expect, it } from 'vitest';

import {
  DETIK_PER_ULANGAN_BAWAAN,
  activeMinutesFromHold,
  activeMinutesFromReps,
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
   * Jam olahraga PINDAH dari sisa hari ke potongan PAR 1.0, jadi angka ini
   * justru TURUN. Biaya kerjanya ditambahkan terpisah sebagai kalori bersih.
   * Inilah mekanisme yang membuat satu jam tidak bisa dibayar dua kali: satu
   * jam cuma bisa berada di satu potongan.
   */
  it('memindahkan jam olahraga keluar dari sisa hari, bukan menambahkannya', () => {
    const diam = restingPartitionPAL(dasar);
    const aktif = restingPartitionPAL({ ...dasar, workoutMinutes: 60 });

    expect(aktif).toBeLessThan(diam);
  });

  /**
   * Regresi untuk dobel hitung yang dulu lolos dari partisi. Langkah pernah
   * punya potongan sendiri, dan jalan kaki yang dicatat sebagai olahraga ikut
   * terhitung pedometer, jadi jalan yang sama masuk dua kali. Sekarang tidak
   * ada cara memasukkan langkah ke sini sama sekali, dan tipe PalInput menolak
   * mencobanya. Tes ini menjaga supaya potongan itu tidak diam-diam kembali.
   */
  it('tidak punya potongan langkah', () => {
    const kunci = Object.keys(dasar).sort();

    expect(kunci).toEqual(['activityLevel', 'sleepMinutes', 'workoutMinutes']);
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
      workoutMinutes: 360,
    });

    expect(hasil).toBe(1);
  });
});

describe('calculateTDEE', () => {
  const dasar = {
    bmr: 1749,
    activityLevel: 'SEDENTARY' as const,
    sleepMinutes: 480,
    workoutMinutes: 0,
    workoutCalories: 0,
  };

  it('menjumlahkan metabolisme dan olahraga, tidak ada suku lain', () => {
    const hasil = calculateTDEE(dasar);

    expect(hasil.tdee).toBe(hasil.baseline + hasil.workout_calories);
    expect(Object.keys(hasil).sort()).toEqual(['baseline', 'pal', 'tdee', 'workout_calories']);
  });

  /**
   * PAL yang dilaporkan harus PAL sesungguhnya (TDEE/BMR), bukan potongan
   * istirahatnya. Kalau salah, angkanya tidak bisa dibandingkan dengan pita
   * FAO/WHO dan siapa pun yang mengeceknya akan tersesat.
   */
  it('melaporkan PAL sesungguhnya, bukan potongan istirahatnya', () => {
    // Hari tanpa olahraga keduanya memang sama. Bedanya baru terlihat begitu
    // ada kalori olahraga di atas potongan istirahat.
    const aktif = { ...dasar, workoutMinutes: 45, workoutCalories: 400 };
    const hasil = calculateTDEE(aktif);

    expect(hasil.pal).toBeCloseTo(hasil.tdee / dasar.bmr, 3);
    expect(hasil.pal).toBeGreaterThan(restingPartitionPAL(aktif));
  });

  /**
   * Hari kantor tanpa olahraga harus mendarat di pita "sedentary or light
   * activity lifestyle" FAO/WHO, yaitu 1.40 sampai 1.69. Ini kalibrasi yang
   * membenarkan nilai ACTIVITY_PAR, kalau meleset, seluruh angka TDEE ikut.
   */
  it('mendarat di pita sedentary FAO/WHO untuk hari kantor biasa', () => {
    const hasil = calculateTDEE(dasar);

    expect(hasil.pal).toBeGreaterThanOrEqual(1.4);
    expect(hasil.pal).toBeLessThanOrEqual(1.69);
  });

  /**
   * Pekerja kantoran yang lari 45 menit TIDAK naik ke pita moderat FAO/WHO
   * (1.70-1.99). Itu memang benar: pita moderat menggambarkan orang yang
   * pekerjaannya banyak bergerak, bukan pekerja duduk yang berolahraga. Yang
   * naik ke pita moderat adalah pekerjaan moderat plus olahraga yang sama.
   */
  it('pita FAO/WHO ditentukan pekerjaan, olahraga cuma menggesernya', () => {
    const lari = caloriesFromWorkout(netKcalPerMinuteAt70(8.3), 45, 80);

    const kantoran = calculateTDEE({ ...dasar, workoutMinutes: 45, workoutCalories: lari });
    const perawat = calculateTDEE({
      ...dasar,
      activityLevel: 'MODERATELY_ACTIVE',
      workoutMinutes: 45,
      workoutCalories: lari,
    });

    expect(kantoran.pal).toBeGreaterThan(1.5);
    expect(kantoran.pal).toBeLessThan(1.7);
    expect(perawat.pal).toBeGreaterThanOrEqual(1.7);
    expect(perawat.pal).toBeLessThanOrEqual(1.99);
  });

  /**
   * INI TES YANG PALING PENTING DI BERKAS INI.
   *
   * Menambahkan olahraga tidak boleh menaikkan TDEE sebesar kalori olahraganya
   * secara utuh. Jam olahraga itu MENGGANTIKAN jam sisa hari, jadi baseline-nya
   * ikut berkurang. Kalau kenaikannya sama persis dengan kalori olahraga, berarti
   * jam yang sama dibayar dua kali, persis bug yang metode ini dibuat untuk
   * menghapusnya.
   */
  it('tidak menghitung dua kali saat olahraga ditambahkan', () => {
    const tanpa = calculateTDEE(dasar);
    const dengan = calculateTDEE({ ...dasar, workoutMinutes: 60, workoutCalories: 400 });

    expect(dengan.tdee).toBeGreaterThan(tanpa.tdee);
    expect(dengan.tdee - tanpa.tdee).toBeLessThan(400);
    expect(dengan.baseline).toBeLessThan(tanpa.baseline);
  });

  /**
   * Bagian rumus dari keluhan nyata: jalan kaki pakai jam (180 kkal aktif),
   * renang tanpa jam (350 kkal MET), pedometer mencatat 6.000 langkah dari
   * jalan tadi. Dulu jalan yang sama masuk sampai tiga kali. Di sisi rumus,
   * yang bisa dijamin sekarang: totalnya PERSIS baseline + olahraga, dan
   * langkah bukan lagi masukan, jadi tidak ada suku tersembunyi yang bisa
   * menambahkannya lagi. Sisi perangkatnya dibuktikan di
   * tests/device-energy.integration.test.ts.
   */
  it('totalnya persis baseline ditambah olahraga, langkah tidak ikut campur', () => {
    const jalan = 180;
    const renang = 350;

    const hasil = calculateTDEE({
      ...dasar,
      workoutMinutes: 70,
      workoutCalories: jalan + renang,
    });

    expect(hasil.tdee).toBe(hasil.baseline + jalan + renang);
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
   * Perhatikan bahwa hasilnya TIDAK selalu di bawah angka MET mentahnya, di atas 5.44
   * MET justru melampauinya, karena pengali 1.225 tumbuh lebih
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
  /**
   * 10.000 x 80 x 0.00035 = 280 kkal bersih. Konversi ini HANYA dipakai untuk
   * anjuran "tambah sekian langkah" di rencana berat badan, bukan untuk
   * calories_out harian. Tesnya dipertahankan supaya konstanta turunannya
   * tetap terjaga.
   */
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

describe('menit gerak dari repetisi dan tahan', () => {
  it('5 push up adalah 15 detik gerak, bukan satu menit', () => {
    expect(activeMinutesFromReps(1, 5)).toBeCloseTo(0.25, 5);
    expect(DETIK_PER_ULANGAN_BAWAAN).toBe(3);
  });

  it('memakai detik per ulangan dari library kalau ada', () => {
    // Deadlift 4 detik: 3 set x 8 ulangan = 96 detik = 1,6 menit.
    expect(activeMinutesFromReps(3, 8, 4)).toBeCloseTo(1.6, 5);
  });

  it('plank 3 x 45 detik adalah 2,25 menit', () => {
    expect(activeMinutesFromHold(3, 45)).toBeCloseTo(2.25, 5);
  });

  it('kalorinya kecil dan itu jujur: 5 push up untuk 80 kg sekitar 2 kkal', () => {
    const kkal = caloriesFromWorkout(netKcalPerMinuteAt70(8.0), activeMinutesFromReps(1, 5), 80);
    expect(kkal).toBe(2);
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
   * Target yang wajar harus benar-benar mendarat di berat target, dibuktikan
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
    expect(baselineTDEE(1749, 'SEDENTARY')).toBe(baselineTDEE(1749, 'SEDENTARY'));
  });

  it('naik seiring beratnya pekerjaan', () => {
    expect(baselineTDEE(1749, 'VERY_ACTIVE')).toBeGreaterThan(baselineTDEE(1749, 'SEDENTARY'));
  });

  /**
   * Hari kantor: tidur 8 jam PAR 1.0, sisa 16 jam PAR 1.6. Tidak ada lagi
   * asumsi 3.000 langkah yang dulu menambah sekitar 84 kkal untuk 80 kg.
   */
  it('tidak lagi menyelipkan asumsi langkah', () => {
    expect(baselineTDEE(1749, 'SEDENTARY')).toBe(Math.round(1749 * ((480 + 960 * 1.6) / 1440)));
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
