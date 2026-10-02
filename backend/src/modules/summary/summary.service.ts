import type { FoodDayStatus } from '../../constants/enums.js';
import { forUser } from '../../data/scoped.js';
import { loadEnergyProfile } from '../../data/energy-profile.js';
import { hariBelumLengkap } from '../../data/food-day-status.js';
import { AppError } from '../../utils/api-error.js';
import { dailyCaloriesOut } from '../../utils/calories.js';
import { jakartaDate, todayInJakarta } from '../../utils/daily-key.js';
import { effectiveBudget } from '../goals/goals.service.js';
import type { CalendarSection } from './summary.validation.js';
import { toNumber } from '../../utils/number.js';
import { dateRangeFilter, timestampDayFilter, timestampRangeFilter } from '../../utils/query.js';
import { type DailyTargets, dailyTargets } from '../../utils/targets.js';

/**
 * Rincian dari mana pengeluaran energi hari itu datang.
 *
 * Dipisah supaya user bisa melihat susunannya, bukan cuma satu angka besar yang
 * harus dipercaya begitu saja.
 */
export interface EnergyBreakdown {
  /** Physical Activity Level hari itu: kalori keluar dibagi BMR. */
  pal: number;
  /**
   * Metabolisme basal dikali PAL partisi: hidup, pekerjaan, dan jalan-jalan
   * kecil sepanjang hari. Langkah tidak dirinci terpisah karena memang tidak
   * dihitung terpisah, lihat catatan LANGKAH di utils/calories.ts.
   */
  baseline: number;
  /**
   * Kalori bersih olahraga yang ikut dijumlahkan. Tanpa angka jam: semua
   * olahraga. Dengan angka jam: hanya yang tidak terekam jam, karena yang
   * terekam sudah ada di kalori aktif jam.
   */
  workout_calories: number;
  /** Kalori aktif jam tangan yang dijumlahkan. Null kalau hari itu tanpa angka jam. */
  device_active_kcal: number | null;
}

export interface DailySummary {
  date: string;
  weight_kg: number | null;
  calories_in: number;
  calories_out: number;
  /**
   * Angka TOTAL smartwatch hari itu apa adanya, kalau user mencatatnya.
   * Sekadar keterangan; yang masuk hitungan adalah kalori aktifnya, lihat
   * energy.device_active_kcal.
   */
  device_kcal: number | null;
  /**
   * "device" berarti kalori aktif jam ikut dijumlahkan hari itu (BMR x PAL +
   * aktif jam + olahraga tanpa jam). "formula" berarti tanpa angka jam.
   */
  calories_out_source: 'formula' | 'device';
  calorie_budget: number | null;
  /** Sisa jatah kalori hari ini. Negatif berarti sudah lewat budget. */
  calories_remaining: number | null;
  /** Null selama profil belum diisi atau user belum pernah menimbang. */
  energy: EnergyBreakdown | null;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Gula total dari semua catatan makan hari itu, gram. */
  sugar_g: number;
  /** Jawaban user soal lengkap tidaknya catatan makan hari itu, null kalau belum ditanya. */
  food_day_status: FoodDayStatus | null;
  /**
   * true kalau hari itu sudah lewat, ada catatan makan, tapi totalnya di bawah
   * separuh jatah. Layar menanyakan "belum lengkap atau memang segini" kalau
   * food_day_status masih null.
   */
  food_low: boolean;
  steps: number;
  water_ml: number;
  sleep_minutes: number;
  workout_minutes: number;
  /**
   * Kalori dari olahraga saja, terpisah dari calories_out.
   *
   * calories_out memuat metabolisme juga, jadi angkanya tidak bisa dipakai
   * untuk menjawab "olahraga tadi membakar berapa". Dipisah di sini
   * supaya layar bisa menampilkan durasi dan kalorinya berdampingan tanpa
   * harus memanggil endpoint olahraga lagi.
   */
  workout_calories: number;
  mood_score: number | null;
  energy_score: number | null;
  has_body_photo: boolean;
  /**
   * Target harian yang diturunkan dari tubuh dan tujuan user.
   *
   * Dikirim dari sini supaya layar tidak perlu menghitung apa pun, dan supaya
   * angka target tidak lagi ditulis sebagai konstanta di kode mobile, yang
   * membuatnya sama untuk semua orang dan mustahil dipertanggungjawabkan.
   */
  targets: DailyTargets;
}

export const getDaily = async (userId: string, date: string): Promise<DailySummary> => {
  const repo = forUser(userId);
  const hari = { logged_at: { _eq: date } };
  const hariTimestamp = timestampDayFilter(date);

  // Belasan query yang tidak saling bergantung. Berurutan berarti menumpuk
  // latensi HTTP ke Directus sebanyak itu; paralel cuma selama yang paling
  // lambat. Ini alasan CLAUDE.md section 4 mewajibkan Promise.all.
  const [
    metrics,
    weightLog,
    goal,
    kaloriMasuk,
    protein,
    karbo,
    lemak,
    stepLog,
    air,
    tidur,
    workoutMenit,
    workoutKalori,
    mood,
    fotoBadan,
    deviceLog,
    workoutKaloriLuarDevice,
    gula,
    statusMakan,
  ] = await Promise.all([
    loadEnergyProfile(userId),
    repo.findOne('weight_logs', { filter: hari }),
    repo.findOne('goals', { filter: { is_active: { _eq: true } } }),
    repo.sum('food_logs', 'total_calories', hariTimestamp),
    repo.sum('food_logs', 'protein_g', hariTimestamp),
    repo.sum('food_logs', 'carbs_g', hariTimestamp),
    repo.sum('food_logs', 'fat_g', hariTimestamp),
    repo.findOne('step_logs', { filter: hari }),
    repo.sum('water_logs', 'amount_ml', hariTimestamp),
    repo.sum('sleep_logs', 'duration_minutes', hari),
    repo.sum('workout_logs', 'duration_minutes', hari),
    repo.sum('workout_logs', 'calories_burned', hari),
    repo.findOne('mood_logs', { filter: hari }),
    repo.count('body_photos', hari),
    repo.findOne('device_energy_logs', { filter: hari }),
    // Baris lama dibuat sebelum kolom penandanya ada, jadi nilainya null, bukan
    // false. Memakai _eq: false saja akan melewatkan semuanya dan olahraga yang
    // seharusnya ditambahkan justru hilang dari hitungan.
    repo.sum('workout_logs', 'calories_burned', {
      logged_at: { _eq: date },
      _or: [{ tracked_by_device: { _eq: false } }, { tracked_by_device: { _null: true } }],
    }),
    repo.sum('food_logs', 'sugar_g', hariTimestamp),
    repo.findOne('food_day_status', { filter: hari }),
  ]);

  const weightKg = weightLog ? toNumber(weightLog.weight_kg) : null;
  const langkah = stepLog?.steps ?? 0;
  // Jatah yang berlaku hari ini: otomatis mengikuti berat terbaru, manual dikunci.
  const budget = goal ? effectiveBudget(goal, metrics) : null;

  /**
   * Berat yang dipakai berhitung: yang tercatat hari itu kalau ada, kalau tidak
   * yang terakhir diketahui. Rekap hari lampau jadi memakai berat yang benar
   * pada hari itu, bukan berat hari ini yang bisa sudah jauh berbeda.
   */
  const beratHitung = weightKg ?? metrics.weightKg;

  /**
   * Kalori keluar lewat metode faktorial, dengan angka jam tangan DITAMBAHKAN
   * kalau ada. Aturannya ditulis sekali di dailyCaloriesOut (utils/calories.ts)
   * supaya beranda, riwayat, dan chat tidak pernah menyebut dua angka berbeda
   * untuk hari yang sama.
   *
   * Langkah sengaja TIDAK dikirim ke sana. Jalan kaki yang dicatat sebagai
   * olahraga juga terhitung pedometer, jadi memasukkan keduanya membayar jalan
   * yang sama dua kali. Langkah tetap ditampilkan sebagai pantauan di bawah.
   *
   * Ini TIDAK menyentuh jatah kalori harian. Budget datang dari baselineTDEE()
   * dan sengaja stabil, supaya user tahu berapa yang boleh dimakan sejak pagi
   * dan bukan baru setelah harinya berakhir.
   */
  const keluar = dailyCaloriesOut({
    bmr: metrics.bmr,
    activityLevel: metrics.activityLevel,
    sleepMinutes: tidur > 0 ? tidur : null,
    workoutMinutes: workoutMenit,
    workoutCalories: workoutKalori,
    untrackedWorkoutCalories: workoutKaloriLuarDevice,
    device: deviceLog,
  });

  const kaloriDevice = deviceLog?.total_kcal ?? null;

  // Pertanyaan "belum lengkap?" cuma masuk akal untuk hari yang sudah lewat:
  // jam sepuluh pagi, separuh jatah memang belum termakan.
  const makanRendah =
    date < todayInJakarta() && budget !== null && kaloriMasuk > 0 && kaloriMasuk < budget / 2;

  return {
    date,
    weight_kg: weightKg,
    calories_in: kaloriMasuk,
    calories_out: keluar.calories_out,
    device_kcal: kaloriDevice,
    calories_out_source: keluar.source,
    calorie_budget: budget,
    calories_remaining: budget === null ? null : budget - kaloriMasuk,
    energy:
      keluar.baseline === null || keluar.pal === null
        ? null
        : {
            pal: keluar.pal,
            baseline: keluar.baseline,
            workout_calories: keluar.workout_calories,
            device_active_kcal: keluar.device_active_kcal,
          },
    protein_g: protein,
    carbs_g: karbo,
    fat_g: lemak,
    sugar_g: Math.round(gula * 10) / 10,
    food_day_status: statusMakan?.status ?? null,
    food_low: makanRendah,
    steps: langkah,
    water_ml: air,
    sleep_minutes: tidur,
    workout_minutes: workoutMenit,
    workout_calories: workoutKalori,
    mood_score: mood?.mood_score ?? null,
    energy_score: mood?.energy_score ?? null,
    has_body_photo: fotoBadan > 0,
    targets: dailyTargets({
      weightKg: beratHitung,
      age: metrics.age,
      gender: metrics.gender,
      calorieBudget: budget,
      // Defisit dibandingkan dengan TDEE hari biasa, bukan keluar hari ini:
      // target protein tidak boleh berayun mengikuti olahraga hari itu.
      isDeficit: budget !== null && metrics.baselineTdee !== null && budget < metrics.baselineTdee,
      workoutMinutes: workoutMenit,
      customStepTarget: metrics.stepTarget,
    }),
  };
};

export interface PeriodSummary {
  from: string;
  to: string;
  days: number;
  weight_start: number | null;
  weight_end: number | null;
  weight_change_kg: number | null;
  total_calories_in: number;
  /**
   * Rata-rata HANYA dari hari yang ada catatannya, bukan dibagi panjang
   * periode. Dibagi tujuh, satu malam yang lupa dicatat menurunkan rata-rata
   * tidur jadi "2 jam per malam" dan angka itu pernah dipakai model chat untuk
   * menceramahi user soal tidur yang sebenarnya baik-baik saja. Jumlah hari
   * pembaginya ikut dikirim supaya layar bisa menulis "dari N hari tercatat".
   */
  avg_calories_in: number;
  /** Hari WIB yang makannya tercatat DAN tidak ditandai belum lengkap. */
  food_days: number;
  /** Hari yang ditandai user belum lengkap, tidak ikut rata-rata kalori masuk. */
  food_days_incomplete: number;
  total_steps: number;
  avg_steps: number;
  step_days: number;
  total_water_ml: number;
  total_sleep_minutes: number;
  avg_sleep_minutes: number;
  sleep_days: number;
  total_workout_minutes: number;
  total_workout_calories: number;
  /** Berapa hari user menimbang badan dalam periode ini (jumlah baris weight_logs). */
  days_logged: number;
  /**
   * Rata-rata kalori keluar menurut smartwatch, dari hari-hari yang dicatat saja.
   * Null kalau tidak ada satu pun catatan perangkat di periode ini.
   *
   * Ini bahan pembanding, BUKAN bahan perhitungan. Dipisahkan supaya user bisa
   * melihat sendiri seberapa jauh jam tangannya berbeda dari TDEE yang diukur
   * dari kekekalan energi, tanpa salah satu diam-diam mempengaruhi yang lain.
   */
  avg_device_kcal: number | null;
}

const rata = (total: number, hari: number): number => (hari === 0 ? 0 : Math.round(total / hari));

/**
 * Rekap satu rentang tanggal.
 *
 * Semua penjumlahan dikerjakan Postgres lewat agregasi, bukan dengan menarik
 * seluruh baris ke Node lalu menjumlahkannya. Untuk rentang sebulan bedanya
 * sudah terasa, dan untuk data bertahun-tahun bedanya menentukan.
 */
const getPeriod = async (userId: string, from: string, to: string): Promise<PeriodSummary> => {
  const repo = forUser(userId);
  const range = { from, to };
  const filterTanggal = dateRangeFilter(range);
  const filterTimestamp = timestampRangeFilter(range);

  const [
    beratAwal,
    beratAkhir,
    kalori,
    langkah,
    air,
    tidur,
    workoutMenit,
    workoutKalori,
    hariTercatat,
    deviceTotal,
    deviceHari,
    hariLangkah,
    hariTidur,
    catatanMakan,
    belumLengkap,
  ] = await Promise.all([
    repo.findOne('weight_logs', { filter: filterTanggal, sort: ['logged_at'] }),
    repo.findOne('weight_logs', { filter: filterTanggal, sort: ['-logged_at'] }),
    repo.sum('food_logs', 'total_calories', filterTimestamp),
    repo.sum('step_logs', 'steps', filterTanggal),
    repo.sum('water_logs', 'amount_ml', filterTimestamp),
    repo.sum('sleep_logs', 'duration_minutes', filterTanggal),
    repo.sum('workout_logs', 'duration_minutes', filterTanggal),
    repo.sum('workout_logs', 'calories_burned', filterTanggal),
    repo.count('weight_logs', filterTanggal),
    repo.sum('device_energy_logs', 'total_kcal', filterTanggal),
    repo.count('device_energy_logs', filterTanggal),
    repo.count('step_logs', filterTanggal),
    repo.count('sleep_logs', filterTanggal),
    // Sesi makan bisa beberapa kali sehari, jadi yang dihitung hari WIB yang
    // berbeda, bukan jumlah barisnya.
    repo.list('food_logs', {
      filter: filterTimestamp,
      fields: ['logged_at', 'total_calories'],
      limit: -1,
    }),
    hariBelumLengkap(userId, range),
  ]);

  // Rata-rata kalori masuk dari hari yang tercatat DAN tidak ditandai belum
  // lengkap. Hari yang user akui ada yang lupa dicatat bukan hari makan
  // sedikit, dan merata-ratakannya menurunkan angka ke arah yang berbahaya.
  const masukPerHari = new Map<string, number>();
  for (const c of catatanMakan) {
    const tanggal = jakartaDate(c.logged_at);
    masukPerHari.set(tanggal, (masukPerHari.get(tanggal) ?? 0) + c.total_calories);
  }
  const hariLengkap = [...masukPerHari.entries()].filter(([t]) => !belumLengkap.has(t));
  const hariMakan = hariLengkap.length;
  const kaloriLengkap = hariLengkap.reduce((total, [, k]) => total + k, 0);

  const hari =
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;

  const awal = beratAwal ? toNumber(beratAwal.weight_kg) : null;
  const akhir = beratAkhir ? toNumber(beratAkhir.weight_kg) : null;

  return {
    from,
    to,
    days: hari,
    weight_start: awal,
    weight_end: akhir,
    weight_change_kg: awal === null || akhir === null ? null : Number((akhir - awal).toFixed(2)),
    total_calories_in: kalori,
    avg_calories_in: rata(kaloriLengkap, hariMakan),
    food_days: hariMakan,
    food_days_incomplete: masukPerHari.size - hariMakan,
    total_steps: langkah,
    avg_steps: rata(langkah, hariLangkah),
    step_days: hariLangkah,
    total_water_ml: air,
    total_sleep_minutes: tidur,
    avg_sleep_minutes: rata(tidur, hariTidur),
    sleep_days: hariTidur,
    total_workout_minutes: workoutMenit,
    total_workout_calories: workoutKalori,
    days_logged: hariTercatat,
    // Dibagi jumlah hari YANG DICATAT, bukan jumlah hari dalam periode. Membagi
    // dengan seluruh periode akan menurunkan rata-ratanya setiap kali user lupa
    // mencatat, dan angkanya jadi menggambarkan kerajinan mencatat, bukan
    // pengeluaran energi.
    avg_device_kcal: deviceHari === 0 ? null : Math.round(deviceTotal / deviceHari),
  };
};

const geserHari = (date: string, hari: number): string =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + hari * 86_400_000).toISOString().slice(0, 10);

export const getWeekly = async (userId: string, from?: string): Promise<PeriodSummary> => {
  const mulai = from ?? geserHari(todayInJakarta(), -6);
  return getPeriod(userId, mulai, geserHari(mulai, 6));
};

export const getMonthly = async (
  userId: string,
  year?: number,
  month?: number,
): Promise<PeriodSummary> => {
  const hariIni = todayInJakarta();
  const tahun = year ?? Number(hariIni.slice(0, 4));
  const bulan = month ?? Number(hariIni.slice(5, 7));

  if (bulan < 1 || bulan > 12) {
    throw AppError.badRequest('Bulan harus antara 1 sampai 12');
  }

  const from = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
  // Hari ke-0 bulan berikutnya adalah hari terakhir bulan ini, jadi tidak perlu
  // tabel jumlah hari per bulan maupun penanganan tahun kabisat.
  const to = new Date(Date.UTC(tahun, bulan, 0)).toISOString().slice(0, 10);

  return getPeriod(userId, from, to);
};

// ============================================================
// RIWAYAT MASUK VS KELUAR PER HARI
// ============================================================

export interface HistoryDay {
  date: string;
  calories_in: number;
  calories_out: number;
  calories_out_source: 'formula' | 'device';
  /** Jatah yang berlaku SEKARANG. Jatah lampau tidak disimpan, lihat catatan. */
  calorie_budget: number | null;
  /** keluar dikurangi masuk. Positif defisit, negatif surplus. */
  balance: number;
  /** Ada catatan makan hari itu. Tanpa ini, defisitnya semu: bukan tidak makan, tapi tidak mencatat. */
  logged: boolean;
  /**
   * User menandai catatan makan hari itu belum lengkap. Tetap ditampilkan,
   * tapi seperti hari tanpa catatan, TIDAK ikut rata-rata.
   */
  incomplete: boolean;
}

export interface HistorySummary {
  from: string;
  to: string;
  days: HistoryDay[];
  /** Dihitung HANYA dari hari yang tercatat makannya dan tidak ditandai belum lengkap. */
  summary: {
    days_logged: number;
    /** Hari bercatatan yang ditandai belum lengkap, dikeluarkan dari rata-rata. */
    days_incomplete: number;
    avg_calories_in: number;
    avg_calories_out: number;
    avg_balance: number;
    /** Hari tercatat yang keluarnya lebih besar dari masuknya. */
    deficit_days: number;
  };
}

/**
 * Riwayat kalori masuk vs keluar, satu baris per hari WIB.
 *
 * Dibangun dari LIMA query rentang lalu dikelompokkan di sini, bukan dengan
 * memanggil getDaily() per hari: 30 hari x 13 query adalah 390 round-trip ke
 * Directus, dan halaman ini dibuka untuk dilihat sekilas.
 *
 * Kalori keluar dihitung lewat dailyCaloriesOut(), fungsi yang sama dengan
 * getDaily(): BMR x PAL dari tidur dan olahraga hari itu, ditambah semua
 * olahraga, atau ditambah kalori aktif jam dan olahraga yang tidak terekam
 * jam kalau angka jamnya ada. Bedanya cuma BMR-nya memakai berat terakhir
 * untuk semua hari, bukan berat pada hari itu, karena menarik berat per hari
 * untuk 30 hari demi selisih beberapa kalori tidak sepadan.
 *
 * Jatah yang ditampilkan adalah jatah yang berlaku SEKARANG. Jatah tidak
 * disimpan per hari, jadi hari-hari sebelum jatah berubah tampak dibandingkan
 * dengan angka yang saat itu belum berlaku. Balance-nya sendiri tidak
 * terpengaruh, itu murni keluar dikurangi masuk.
 *
 * Hari tanpa catatan makan ditandai, bukan dibuang, dan TIDAK ikut rata-rata.
 * Nol kalori masuk pada hari yang tidak dicatat bukan defisit, cuma lupa
 * membuka aplikasi, dan merata-ratakannya membuat defisitnya tampak jauh lebih
 * besar dari kenyataan, persis arah kesalahan yang paling berbahaya di sini.
 * Hari yang user tandai "belum lengkap" diperlakukan sama, dengan alasan yang
 * sama: separuh catatan bukan separuh makan.
 */
export const getHistory = async (userId: string, days: number): Promise<HistorySummary> => {
  const repo = forUser(userId);
  const to = todayInJakarta();
  const from = geserHari(to, -(days - 1));
  const range = { from, to };

  const [metrics, goal, makanan, olahraga, tidur, perangkat, belumLengkap] = await Promise.all([
    loadEnergyProfile(userId),
    repo.findOne('goals', { filter: { is_active: { _eq: true } } }),
    repo.list('food_logs', {
      filter: timestampRangeFilter(range),
      fields: ['logged_at', 'total_calories'],
      limit: -1,
    }),
    repo.list('workout_logs', {
      filter: dateRangeFilter(range),
      fields: ['logged_at', 'duration_minutes', 'calories_burned', 'tracked_by_device'],
      limit: -1,
    }),
    repo.list('sleep_logs', {
      filter: dateRangeFilter(range),
      fields: ['logged_at', 'duration_minutes'],
      limit: -1,
    }),
    repo.list('device_energy_logs', {
      filter: dateRangeFilter(range),
      fields: ['logged_at', 'total_kcal', 'active_kcal'],
      limit: -1,
    }),
    hariBelumLengkap(userId, range),
  ]);

  interface Harian {
    masuk: number;
    adaMakan: boolean;
    tidur: number;
    menitOlahraga: number;
    kaloriOlahraga: number;
    kaloriOlahragaTanpaJam: number;
    perangkat: { total_kcal: number; active_kcal: number | null } | null;
  }

  const perHari = new Map<string, Harian>();
  const ambil = (tanggal: string): Harian => {
    let h = perHari.get(tanggal);
    if (!h) {
      h = {
        masuk: 0,
        adaMakan: false,
        tidur: 0,
        menitOlahraga: 0,
        kaloriOlahraga: 0,
        kaloriOlahragaTanpaJam: 0,
        perangkat: null,
      };
      perHari.set(tanggal, h);
    }
    return h;
  };

  for (const m of makanan) {
    // Dikelompokkan menurut tanggal WIB, bukan UTC, sama seperti energy-profile.
    if (m.logged_at === null) continue;
    const h = ambil(jakartaDate(m.logged_at));
    h.masuk += m.total_calories;
    h.adaMakan = true;
  }
  for (const o of olahraga) {
    const h = ambil(o.logged_at);
    h.menitOlahraga += o.duration_minutes;
    h.kaloriOlahraga += o.calories_burned;
    // Baris lama punya null, artinya tidak terekam jam, sama seperti di getDaily.
    if (o.tracked_by_device !== true) h.kaloriOlahragaTanpaJam += o.calories_burned;
  }
  for (const t of tidur) ambil(t.logged_at).tidur += t.duration_minutes;
  for (const p of perangkat) {
    ambil(p.logged_at).perangkat = { total_kcal: p.total_kcal, active_kcal: p.active_kcal };
  }

  const budget = goal ? effectiveBudget(goal, metrics) : null;

  const hasil: HistoryDay[] = [];
  for (let i = 0; i < days; i++) {
    const tanggal = geserHari(from, i);
    const h = ambil(tanggal);

    const keluar = dailyCaloriesOut({
      bmr: metrics.bmr,
      activityLevel: metrics.activityLevel,
      sleepMinutes: h.tidur > 0 ? h.tidur : null,
      workoutMinutes: h.menitOlahraga,
      workoutCalories: h.kaloriOlahraga,
      untrackedWorkoutCalories: h.kaloriOlahragaTanpaJam,
      device: h.perangkat,
    });

    hasil.push({
      date: tanggal,
      calories_in: Math.round(h.masuk),
      calories_out: Math.round(keluar.calories_out),
      calories_out_source: keluar.source,
      calorie_budget: budget,
      balance: Math.round(keluar.calories_out - h.masuk),
      logged: h.adaMakan,
      incomplete: h.adaMakan && belumLengkap.has(tanggal),
    });
  }

  const tercatat = hasil.filter((d) => d.logged && !d.incomplete);
  const n = tercatat.length;
  const jumlah = (ambilNilai: (d: HistoryDay) => number) =>
    tercatat.reduce((total, d) => total + ambilNilai(d), 0);

  return {
    from,
    to,
    days: hasil,
    summary: {
      days_logged: n,
      days_incomplete: hasil.filter((d) => d.incomplete).length,
      avg_calories_in: n === 0 ? 0 : Math.round(jumlah((d) => d.calories_in) / n),
      avg_calories_out: n === 0 ? 0 : Math.round(jumlah((d) => d.calories_out) / n),
      avg_balance: n === 0 ? 0 : Math.round(jumlah((d) => d.balance) / n),
      deficit_days: tercatat.filter((d) => d.balance > 0).length,
    },
  };
};

// ============================================================
// KALENDER: TANGGAL YANG ADA DATANYA PER LAYAR
// ============================================================

export interface CalendarDays {
  from: string;
  to: string;
  /** Tanggal yang punya data untuk layar itu. Hari tanpa data sengaja tidak ditandai. */
  dates: string[];
  /** Khusus makanan: tanggal yang ditandai user belum lengkap. Kosong untuk layar lain. */
  incomplete: string[];
}

type KoleksiTanggal =
  | 'workout_logs'
  | 'step_logs'
  | 'sleep_logs'
  | 'weight_logs'
  | 'mood_logs'
  | 'body_photos'
  | 'body_measurements'
  | 'device_energy_logs';

/** Layar dengan kolom `date`: cukup daftar logged_at. */
const KOLEKSI_TANGGAL: Partial<Record<CalendarSection, KoleksiTanggal[]>> = {
  workout: ['workout_logs'],
  steps: ['step_logs'],
  sleep: ['sleep_logs'],
  weight: ['weight_logs'],
  mood: ['mood_logs'],
  // Layar foto badan juga tempat mencatat lingkar pinggang.
  'body-photo': ['body_photos', 'body_measurements'],
  'device-energy': ['device_energy_logs'],
};

/**
 * Tanggal yang ada datanya untuk SATU layar catat, supaya kalender bisa
 * menandainya dan user tahu hari mana yang terlewat. Layar makanan menandai
 * hari bercatatan makan, layar tidur hari bercatatan tidur, dan seterusnya;
 * data layar lain tidak ikut.
 *
 * Makanan dan minum dikelompokkan menurut tanggal WIB dari timestamp-nya,
 * sama seperti summary harian, supaya titik di kalender jatuh di hari yang
 * sama dengan angka di layarnya.
 */
export const getCalendar = async (
  userId: string,
  type: CalendarSection,
  from: string,
  to: string,
): Promise<CalendarDays> => {
  const repo = forUser(userId);
  const range = { from, to };

  if (type === 'food' || type === 'water') {
    const koleksi = type === 'food' ? 'food_logs' : 'water_logs';
    const [baris, belumLengkap] = await Promise.all([
      repo.list(koleksi, {
        filter: timestampRangeFilter(range),
        fields: ['logged_at'],
        limit: -1,
      }),
      type === 'food' ? hariBelumLengkap(userId, range) : Promise.resolve(new Set<string>()),
    ]);

    const tanggal = new Set(baris.map((b) => jakartaDate(b.logged_at)));
    return {
      from,
      to,
      dates: [...tanggal].sort(),
      incomplete: [...belumLengkap].filter((t) => tanggal.has(t)).sort(),
    };
  }

  const daftar = await Promise.all(
    (KOLEKSI_TANGGAL[type] ?? []).map((koleksi) =>
      repo.list(koleksi, { filter: dateRangeFilter(range), fields: ['logged_at'], limit: -1 }),
    ),
  );

  const tanggal = new Set(daftar.flat().map((b) => b.logged_at));
  return { from, to, dates: [...tanggal].sort(), incomplete: [] };
};
