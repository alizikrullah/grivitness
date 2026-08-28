import { ACTIVITY_PAR, type ActivityLevel, type Gender } from '../constants/enums.js';
import { round } from './number.js';

/**
 * Semua kalkulasi energi terpusat di sini. Lihat CLAUDE.md section 8.
 *
 * SUMBER
 *   BMR            Mifflin MD, St Jeor ST dkk. "A new predictive equation for resting
 *                  energy expenditure in healthy individuals." Am J Clin Nutr
 *                  1990;51(2):241-247.
 *   TDEE           FAO/WHO/UNU. "Human Energy Requirements." Roma 2001, terbit 2004.
 *                  Bab 5 dan Annex 5, metode faktorial dan tabel PAR.
 *   Nilai MET      Ainsworth BE dkk. "2011 Compendium of Physical Activities."
 *                  Med Sci Sports Exerc 2011;43(8):1575-1581.
 *   Konversi MET   Persamaan metabolik ACSM: 1 MET = 3.5 ml O2/kg/menit.
 *   Batas kalori   NIH/NHLBI. "Clinical Guidelines on the Identification, Evaluation,
 *                  and Treatment of Overweight and Obesity in Adults." 1998.
 *   Laju aman      CDC dan NHLBI, 0,5 sampai 1 kg per minggu.
 *
 * Angka-angka di bawah adalah ESTIMASI POPULASI, bukan pengukuran. Mifflin-St Jeor
 * masuk dalam ±10% dari pengukuran sesungguhnya untuk sekitar 82% orang non-obesitas
 * dan 70% orang obesitas. Dipakai untuk memberi titik awal yang masuk akal, bukan
 * untuk diperlakukan sebagai kebenaran.
 */

/** Usia dalam tahun penuh pada tanggal tertentu. */
export const calculateAge = (birthDate: string, at: Date = new Date()): number => {
  const lahir = new Date(birthDate);

  let usia = at.getFullYear() - lahir.getFullYear();

  // Kurangi satu kalau ulang tahunnya belum lewat di tahun ini.
  const bulanBerlalu = at.getMonth() - lahir.getMonth();
  if (bulanBerlalu < 0 || (bulanBerlalu === 0 && at.getDate() < lahir.getDate())) {
    usia -= 1;
  }

  return usia;
};

export interface BmrInput {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
}

/**
 * Basal Metabolic Rate dengan rumus Mifflin-St Jeor.
 *
 * Rumus aslinya cuma mendefinisikan dua varian, pria dan wanita, yang selisihnya
 * ada di konstanta terakhir: +5 dan -161. Untuk gender OTHER dipakai titik tengah
 * keduanya (-78), bukan angka dari literatur, melainkan pilihan yang menghindari
 * memaksa siapa pun masuk ke kategori yang tidak sesuai, dengan galat yang tidak
 * lebih besar daripada galat bawaan rumusnya sendiri.
 */
export const calculateBMR = ({ weightKg, heightCm, age, gender }: BmrInput): number => {
  const dasar = 10 * weightKg + 6.25 * heightCm - 5 * age;

  const konstanta = gender === 'MALE' ? 5 : gender === 'FEMALE' ? -161 : -78;

  return round(dasar + konstanta, 0);
};

// ============================================================
// LANGKAH
// ============================================================

/**
 * Tempo berjalan biasa. Dipakai untuk mengubah jumlah langkah jadi durasi,
 * karena metode faktorial butuh JAM, bukan jumlah.
 */
const LANGKAH_PER_MENIT = 100;

/** Berjalan 2,5 mph (4 km/jam) di permukaan datar. Compendium 2011, kode 17190. */
const MET_JALAN = 3.0;

/**
 * Kalori BERSIH per langkah per kg berat badan, 0.00035.
 *
 * Sengaja DIHITUNG di sini, bukan ditulis sebagai angka jadi. Persis kebiasaan
 * menyimpan hasil tanpa cara memperolehnya yang membuat kesalahan konversi di
 * workout_library bisa hidup berbulan-bulan tanpa terlihat dari mana pun.
 *
 *   1 MET       = 3.5 ml O2/kg/menit  ->  kkal/menit = MET x 3.5 x kg / 200
 *   bersih      = (3.0 - 1) x 3.5 / 200        = 0.035 per kg per menit
 *   per langkah = 0.035 / 100 langkah/menit    = 0.00035 per kg
 *
 * Dikurangi satu MET karena MET mengukur pengeluaran KOTOR, sudah termasuk
 * energi yang tetap terbakar walau cuma duduk diam. Energi itu sudah ditanggung
 * BMR di dalam TDEE, jadi menghitungnya lagi di sini membayar jam yang sama
 * dua kali.
 */
const KKAL_BERSIH_PER_LANGKAH_PER_KG = ((MET_JALAN - 1) * 3.5) / 200 / LANGKAH_PER_MENIT;

/** Berapa menit dihabiskan untuk berjalan sebanyak ini. */
export const walkMinutesFromSteps = (steps: number): number => steps / LANGKAH_PER_MENIT;

/** Estimasi kalori BERSIH terbakar dari jumlah langkah, di atas metabolisme istirahat. */
export const caloriesFromSteps = (steps: number, weightKg: number): number =>
  round(steps * weightKg * KKAL_BERSIH_PER_LANGKAH_PER_KG, 0);

/**
 * Panjang langkah sebagai rasio tinggi badan.
 *
 * Menggantikan asumsi lama 80cm untuk semua orang, yang melebihkan jarak sekitar
 * 10% untuk tinggi rata-rata Indonesia dan makin meleset untuk yang bertubuh
 * kecil. Rasio antropometrik ini yang umum dipakai di literatur gait.
 */
const RASIO_LANGKAH: Record<Gender, number> = { MALE: 0.415, FEMALE: 0.413, OTHER: 0.414 };

/** Estimasi jarak tempuh dalam km, diturunkan dari tinggi badan. */
export const distanceFromSteps = (steps: number, heightCm: number, gender: Gender): number =>
  round((steps * heightCm * RASIO_LANGKAH[gender]) / 100_000, 3);

// ============================================================
// OLAHRAGA
// ============================================================

/** Berat acuan yang dipakai nilai kalori di workout_library. */
export const BERAT_ACUAN_KG = 70;

/**
 * Mengubah nilai MET jadi kalori BERSIH per menit untuk berat acuan 70kg.
 *
 * Ini satu-satunya tempat konversi itu boleh terjadi. Sebelumnya nilai MET
 * disalin mentah ke kolom kkal/menit tanpa pernah dikonversi, dan karena yang
 * tersimpan cuma hasil akhirnya, kesalahan itu tidak kelihatan dari mana pun.
 */
export const netKcalPerMinuteAt70 = (met: number): number =>
  round(((met - 1) * 3.5 * BERAT_ACUAN_KG) / 200, 2);

/**
 * Kalori olahraga, di-scale dari nilai library sesuai berat badan user.
 * Nilai di library adalah kalori bersih untuk berat badan 70kg.
 */
export const caloriesFromWorkout = (
  netKcalPerMinute: number,
  durationMinutes: number,
  weightKg: number,
): number => round((netKcalPerMinute * durationMinutes * weightKg) / BERAT_ACUAN_KG, 0);

// ============================================================
// TDEE, METODE FAKTORIAL
// ============================================================

/** Menit dalam sehari. */
const MENIT_SEHARI = 1440;

/** Tidur, PAR 1.0. Compendium 2011 kode 07030 dan tabel PAR FAO/WHO sepakat. */
const PAR_TIDUR = 1.0;

/**
 * Durasi tidur yang diasumsikan ketika user belum mencatatnya.
 *
 * Delapan jam adalah titik tengah rekomendasi 7-9 jam. Menganggap tidurnya nol
 * akan membuat sisa hari mengisi 24 jam penuh dan TDEE melonjak, persis arah
 * kesalahan yang paling berbahaya untuk aplikasi penurunan berat badan.
 */
const TIDUR_DEFAULT_MENIT = 8 * 60;

export interface PalInput {
  activityLevel: ActivityLevel;
  /** Menit tidur yang tercatat. Null berarti belum dicatat, dipakai asumsi 8 jam. */
  sleepMinutes: number | null;
  steps: number;
  workoutMinutes: number;
}

/**
 * Menghitung PAL satu hari dengan membagi habis 24 jam.
 *
 * Jam berjalan dan jam olahraga diberi PAR 1.0 di sini, BUKAN nilai MET-nya.
 * Yang dihitung di potongan ini hanyalah bagian istirahatnya, biaya kerja di
 * atas istirahat sudah dihitung terpisah sebagai kalori bersih langkah dan
 * olahraga, lalu dijumlahkan di calculateTDEE. Secara aljabar hasilnya sama
 * dengan memberi tiap potongan nilai MET penuh, tapi cara ini tidak memerlukan
 * nilai MET tersimpan di setiap log, sehingga olahraga yang diinput manual,
 * yang memang tidak punya MET, tetap terhitung benar.
 *
 * Karena 24 jam dipartisi, satu jam mustahil masuk dua potongan sekaligus.
 * Itulah yang membuat dobel hitung tidak mungkin terjadi, bukan kehati-hatian.
 */
export const restingPartitionPAL = ({
  activityLevel,
  sleepMinutes,
  steps,
  workoutMinutes,
}: PalInput): number => {
  const tidur = Math.max(sleepMinutes ?? TIDUR_DEFAULT_MENIT, 0);
  const jalan = Math.max(walkMinutesFromSteps(steps), 0);
  const olahraga = Math.max(workoutMinutes, 0);

  // Data yang tidak masuk akal (tidur 20 jam plus olahraga 6 jam) tidak boleh
  // membuat sisa hari jadi negatif dan menghasilkan PAL yang mustahil.
  const terpakai = Math.min(tidur + jalan + olahraga, MENIT_SEHARI);
  const sisa = MENIT_SEHARI - terpakai;

  return round((terpakai * PAR_TIDUR + sisa * ACTIVITY_PAR[activityLevel]) / MENIT_SEHARI, 4);
};

export interface TdeeInput extends PalInput {
  bmr: number;
  weightKg: number;
  /** Kalori bersih olahraga hari itu, dari workout_logs. */
  workoutCalories: number;
}

export interface TdeeBreakdown {
  tdee: number;
  /**
   * PAL sesungguhnya: TDEE dibagi BMR.
   *
   * Sengaja dihitung dari hasil akhir, bukan diambil dari restingPartitionPAL, * yang itu cuma potongan istirahatnya dan angkanya selalu lebih rendah.
   * Menampilkan angka setengah jadi dengan nama "PAL" akan menyesatkan siapa pun
   * yang membandingkannya dengan pita FAO/WHO.
   */
  pal: number;
  /** Bagian yang berasal dari metabolisme dan kegiatan sehari-hari. */
  baseline: number;
  step_calories: number;
  workout_calories: number;
}

/**
 * TDEE satu hari, dipecah supaya user bisa melihat dari mana angkanya datang.
 *
 * Rumus lama `TDEE + olahraga + langkah` menjumlahkan tiga hal yang saling
 * tumpang tindih: pengali aktivitas mendeskripsikan seluruh hari, jadi olahraga
 * dan langkah yang ditambahkan setelahnya menabrak dirinya sendiri. Efeknya
 * defisit terlihat lebih besar daripada kenyataan, persis alasan orang bingung
 * kenapa beratnya tidak turun sesuai perkiraan aplikasi.
 */
export const calculateTDEE = (input: TdeeInput): TdeeBreakdown => {
  const baseline = round(input.bmr * restingPartitionPAL(input), 0);
  const langkah = caloriesFromSteps(input.steps, input.weightKg);

  const tdee = baseline + langkah + input.workoutCalories;

  return {
    tdee,
    pal: input.bmr > 0 ? round(tdee / input.bmr, 3) : 0,
    baseline,
    step_calories: langkah,
    workout_calories: input.workoutCalories,
  };
};

/**
 * Langkah yang diasumsikan pada hari biasa ketika menghitung TDEE acuan.
 *
 * Dipakai sebagai dasar budget kalori, bukan sebagai target. Angkanya sengaja
 * rendah, kira-kira gerak seadanya orang yang tidak berolahraga, supaya
 * budget-nya konservatif. Untuk aplikasi penurunan berat badan, salah menaksir
 * ke bawah membuat user turun sedikit lebih cepat dari perkiraan; salah menaksir
 * ke atas membuat programnya diam-diam tidak bekerja.
 */
const LANGKAH_HARI_BIASA = 3000;

/**
 * TDEE acuan: hari tanpa olahraga, tidur normal, gerak seadanya.
 *
 * Ini yang dipakai untuk menghitung budget kalori, karena budget harus stabil.
 * Kalau budget ikut naik-turun mengikuti aktivitas hari itu, user tidak pernah
 * tahu berapa yang boleh dimakan sampai harinya berakhir.
 */
export const baselineTDEE = (bmr: number, weightKg: number, activityLevel: ActivityLevel): number =>
  calculateTDEE({
    bmr,
    weightKg,
    activityLevel,
    sleepMinutes: null,
    steps: LANGKAH_HARI_BIASA,
    workoutMinutes: 0,
    workoutCalories: 0,
  }).tdee;

// ============================================================
// RENCANA PENURUNAN BERAT BADAN
// ============================================================

/**
 * Perkiraan energi yang tersimpan dalam 1 kg jaringan tubuh, dalam kilokalori.
 *
 * Turunan metrik dari kaidah "3500 kkal per pound" (Wishnofsky, 1958).
 * Angkanya sendiri wajar sebagai kerapatan energi jaringan campuran. Yang keliru
 * adalah cara lamanya dipakai: dibagi sekali di awal, seolah TDEE diam saja
 * sepanjang program. Hall KD dkk. (Lancet 2011;378:826-837) menunjukkan justru
 * di situ letak kesalahannya, makin ringan badan, makin sedikit yang terbakar.
 *
 * Karena itu di bawah ini angka tersebut hanya dipakai per hari, di dalam
 * simulasi yang menghitung ulang BMR dari berat badan hari itu juga.
 */
const KALORI_PER_KG = 7700;

/**
 * Batas bawah asupan harian menurut jenis kelamin.
 *
 * NHLBI menyebut diet rendah kalori pada rentang 1000-1200 kkal untuk wanita
 * dan 1200-1600 kkal untuk pria. Versi sebelumnya memakai 1200 untuk semua
 * orang, yang berarti terlalu longgar untuk pria. Di bawah angka ini kebutuhan
 * mikronutrien sulit terpenuhi dan penurunan berat cenderung mengorbankan otot.
 */
const BATAS_BAWAH_KALORI: Record<Gender, number> = { MALE: 1500, FEMALE: 1200, OTHER: 1350 };

/** Defisit tidak boleh melebihi porsi ini dari TDEE, supaya massa otot tidak jadi korban. */
const DEFISIT_MAKSIMAL_RASIO = 0.25;

/** Laju penurunan aman menurut CDC dan NHLBI. */
const LAJU_MAKSIMAL_KG_PER_MINGGU = 1.0;

/** Sekaligus dibatasi proporsi berat badan, supaya adil untuk yang bertubuh kecil. */
const LAJU_MAKSIMAL_RASIO_PER_MINGGU = 0.01;

/** Laju penambahan berat yang wajar. Menambah lebih cepat dari ini sebagian besar jadi lemak. */
const LAJU_NAIK_MAKSIMAL_KG_PER_MINGGU = 0.5;

/** Batas bawah asupan harian untuk jenis kelamin tertentu. */
export const calorieFloor = (gender: Gender): number => BATAS_BAWAH_KALORI[gender];

/** Laju penurunan aman untuk berat badan tertentu, dalam kg per minggu. */
export const safeWeeklyLossKg = (weightKg: number): number =>
  round(Math.min(LAJU_MAKSIMAL_KG_PER_MINGGU, weightKg * LAJU_MAKSIMAL_RASIO_PER_MINGGU), 2);

export interface PlanInput {
  currentWeightKg: number;
  targetWeightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  /** Jumlah hari tersisa menuju target. */
  daysRemaining: number;
  /**
   * Koreksi TDEE dari pengukuran nyata, sebagai rasio terhadap hasil rumus.
   * 1 berarti belum ada koreksi dan rumus dipakai apa adanya.
   *
   * Dipakai sebagai RASIO, bukan angka mutlak, supaya koreksinya ikut menyusut
   * bersama berat badan selama simulasi. Menyuntikkan satu angka tetap akan
   * membuat TDEE berhenti turun saat badan mengurus, persis kesalahan yang
   * simulasi hari-per-hari ini dibuat untuk menghindarinya.
   */
  tdeeFactor?: number;
}

/** TDEE acuan setelah dikoreksi pengukuran, pada berat badan tertentu. */
const tdeeTerkoreksi = (weightKg: number, input: PlanInput): number => {
  const bmr = calculateBMR({
    weightKg,
    heightCm: input.heightCm,
    age: input.age,
    gender: input.gender,
  });

  return round(baselineTDEE(bmr, weightKg, input.activityLevel) * (input.tdeeFactor ?? 1), 0);
};

/**
 * Menjalankan program maju sehari demi sehari.
 *
 * Inilah yang menggantikan pembagian sekali jalan `(selisih x 7700) / hari`.
 * BMR dihitung ulang dari berat badan hari itu di setiap langkah, jadi
 * melambatnya penurunan seiring turunnya berat ikut tertangkap, kegagalan
 * utama kaidah linear yang ditunjukkan Hall.
 */
const simulasi = (
  intake: number,
  days: number,
  input: PlanInput,
): { finalWeightKg: number; tdeeAkhir: number } => {
  let berat = input.currentWeightKg;
  let tdee = 0;

  for (let i = 0; i < days; i++) {
    tdee = tdeeTerkoreksi(berat, input);

    berat -= (tdee - intake) / KALORI_PER_KG;

    // Penjaga terhadap masukan tidak masuk akal, supaya simulasi tidak pernah
    // menghasilkan berat negatif yang kemudian merusak BMR di langkah berikutnya.
    if (berat < 20) {
      berat = 20;
      break;
    }
  }

  return { finalWeightKg: berat, tdeeAkhir: tdee };
};

/** Asupan yang membuat simulasi mendarat tepat di berat target pada hari ke-`days`. */
const cariAsupan = (days: number, input: PlanInput): number => {
  let bawah = 200;
  let atas = 12_000;

  // Berat akhir naik secara monoton terhadap asupan, jadi pencarian biner selalu
  // menemukan jawabannya. Empat puluh iterasi memberi ketelitian jauh di bawah
  // satu kalori, murah, karena simulasinya cuma aritmetika.
  for (let i = 0; i < 40; i++) {
    const tengah = (bawah + atas) / 2;

    if (simulasi(tengah, days, input).finalWeightKg > input.targetWeightKg) {
      atas = tengah;
    } else {
      bawah = tengah;
    }
  }

  return (bawah + atas) / 2;
};

export interface WeightPlan {
  /** Jatah kalori harian yang dianjurkan, sudah ditahan batas aman. */
  daily_calorie_budget: number;
  /** Defisit harian yang benar-benar dipakai. Negatif berarti surplus. */
  daily_deficit: number;
  /** Defisit yang sebenarnya dibutuhkan untuk mencapai target tepat waktu. */
  required_deficit: number;
  /** False kalau target hanya bisa dikejar dengan asupan di bawah batas aman. */
  achievable: boolean;
  /** TDEE acuan pada berat badan saat ini. */
  tdee: number;
  /** Laju yang dihasilkan budget ini, kg per minggu. */
  weekly_rate_kg: number;
  /** Laju maksimal yang masih dianggap aman untuk berat badan ini. */
  safe_weekly_rate_kg: number;
  /**
   * Berapa hari target itu sebenarnya tercapai dengan budget yang aman.
   * Null kalau tidak akan pernah tercapai pada budget tersebut.
   */
  projected_days: number | null;
  /**
   * Tambahan langkah harian yang menutup sisa defisit ketika diet saja tidak cukup.
   * Nol kalau target sudah bisa dicapai tanpa itu.
   */
  extra_steps_needed: number;
}

/** Berapa hari sampai target tercapai pada asupan tetap. Null kalau tidak pernah. */
const proyeksiHari = (intake: number, input: PlanInput): number | null => {
  const MAKS_HARI = 365 * 5;

  let berat = input.currentWeightKg;
  const turun = input.targetWeightKg < input.currentWeightKg;

  for (let hari = 1; hari <= MAKS_HARI; hari++) {
    berat -= (tdeeTerkoreksi(berat, input) - intake) / KALORI_PER_KG;

    if (turun ? berat <= input.targetWeightKg : berat >= input.targetWeightKg) return hari;
    if (berat < 20) return null;
  }

  return null;
};

/**
 * Menyusun rencana penurunan (atau penambahan) berat badan.
 *
 * Urutannya: cari dulu asupan yang secara matematis mencapai target tepat waktu,
 * lalu tahan dengan tiga pagar keamanan sekaligus, batas bawah kalori, defisit
 * maksimal 25% TDEE, dan laju maksimal per minggu. Yang paling ketat menang.
 *
 * Kalau target ternyata tertahan pagar, angkanya TIDAK dipaksakan. Yang
 * dikembalikan adalah budget yang aman, tanggal realistisnya, dan berapa langkah
 * tambahan yang bisa menutup selisihnya, karena defisit yang tidak boleh datang
 * dari makanan masih boleh datang dari gerak.
 */
export const planWeightChange = (input: PlanInput): WeightPlan => {
  const { currentWeightKg, targetWeightKg, gender } = input;

  const hari = Math.max(input.daysRemaining, 1);
  const turun = targetWeightKg < currentWeightKg;

  const tdee = tdeeTerkoreksi(currentWeightKg, input);

  const asupanIdeal = cariAsupan(hari, input);

  const lajuAman = safeWeeklyLossKg(currentWeightKg);

  // Tiga pagar, semuanya berupa batas BAWAH untuk asupan. Yang tertinggi menang.
  const batasBawah = turun
    ? Math.max(
        calorieFloor(gender),
        tdee * (1 - DEFISIT_MAKSIMAL_RASIO),
        tdee - (lajuAman * KALORI_PER_KG) / 7,
      )
    : 0;

  // Untuk target menaikkan berat, yang dibatasi justru sisi atasnya.
  const batasAtas = turun
    ? Number.POSITIVE_INFINITY
    : tdee + (LAJU_NAIK_MAKSIMAL_KG_PER_MINGGU * KALORI_PER_KG) / 7;

  const budget = round(Math.min(Math.max(asupanIdeal, batasBawah), batasAtas), 0);

  const defisit = round(tdee - budget, 0);
  const defisitDibutuhkan = round(tdee - asupanIdeal, 0);

  const tercapai = turun ? asupanIdeal >= batasBawah : asupanIdeal <= batasAtas;

  // Sisa defisit yang tidak boleh datang dari makanan masih boleh datang dari
  // gerak. Diubah jadi langkah supaya jadi anjuran yang bisa langsung dilakukan.
  const kurang = Math.max(defisitDibutuhkan - defisit, 0);
  const langkahTambahan =
    turun && kurang > 0
      ? Math.round(kurang / (currentWeightKg * KKAL_BERSIH_PER_LANGKAH_PER_KG) / 100) * 100
      : 0;

  return {
    daily_calorie_budget: budget,
    daily_deficit: defisit,
    required_deficit: defisitDibutuhkan,
    achievable: tercapai,
    tdee,
    weekly_rate_kg: round((defisit * 7) / KALORI_PER_KG, 2),
    safe_weekly_rate_kg: lajuAman,
    projected_days: tercapai ? hari : proyeksiHari(budget, input),
    extra_steps_needed: langkahTambahan,
  };
};

/** Selisih hari penuh antara dua tanggal YYYY-MM-DD. */
export const daysBetween = (from: string, to: string): number => {
  const mulai = new Date(`${from}T00:00:00Z`).getTime();
  const selesai = new Date(`${to}T00:00:00Z`).getTime();

  return Math.round((selesai - mulai) / (1000 * 60 * 60 * 24));
};
