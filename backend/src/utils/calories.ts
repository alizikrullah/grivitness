import {
  ACTIVITY_PAR,
  type ActivityLevel,
  type CalorieSource,
  type DistanceKind,
  type Gender,
  type WorkoutIntensity,
} from '../constants/enums.js';
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
 * LANGKAH TIDAK MASUK HITUNGAN KALORI KELUAR. Dia pantauan, bukan bahan hitung.
 *
 * Dulu langkah dipartisi ke PAL dan kalori bersihnya ditambahkan ke TDEE.
 * Itu dicabut, karena membuka pintu dobel hitung yang tidak ditangkap partisi
 * 24 jam: jalan kaki yang dicatat sebagai olahraga JUGA dihitung pedometer ke
 * step_logs, dan yang memakai jam tangan mendapat jalannya untuk ketiga kali
 * lewat kalori aktif perangkat. Partisi cuma menjaga jam tidak tumpang tindih,
 * bukan menjaga satu aktivitas masuk lewat dua pintu.
 *
 * Mencabutnya justru mengembalikan metode faktorial ke bentuk aslinya. FAO/WHO
 * tidak menghitung langkah terpisah; jalan-jalan kecil sepanjang hari sudah
 * terserap di PAR pekerjaan (ACTIVITY_PAR). Yang dikreditkan sebagai gerak
 * hanya olahraga yang dicatat, dan kalori aktif jam tangan bagi yang memakainya.
 *
 * Konstanta di bawah tetap ada untuk SATU keperluan: mengubah sisa defisit jadi
 * anjuran "tambah sekian langkah" di planWeightChange. Itu saran perilaku, bukan
 * kredit kalori. Jalan yang dilakukan lalu dicatat sebagai olahraga barulah
 * dikreditkan.
 */

/** Tempo berjalan biasa, langkah per menit. */
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
 */
const KKAL_BERSIH_PER_LANGKAH_PER_KG = ((MET_JALAN - 1) * 3.5) / 200 / LANGKAH_PER_MENIT;

/**
 * Kalori bersih yang kira-kira terbakar oleh sejumlah langkah.
 *
 * HANYA untuk anjuran langkah tambahan di rencana berat badan. Jangan pernah
 * dipakai untuk calories_out harian, lihat catatan di atas.
 */
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

/**
 * Porsi waktu sesi yang dipakai BERGERAK, per intensitas.
 *
 * MET di Compendium mengukur gerak terus-menerus, padahal sesi nyata punya
 * jeda: renang 75 menit dengan banyak istirahat di tepi kolam bukan 75 menit
 * gaya bebas. Definisinya dari pemiliknya: rendah banyak istirahat, sedang
 * lebih sedikit, tinggi hampir terus bergerak dengan jeda napas.
 *
 * Angka 0,5 / 0,75 / 0,9 (gerak:istirahat 1:1, 3:1, 9:1) adalah PERKIRAAN
 * aplikasi ini, bukan penelitian. Yang dari Compendium cuma MET-nya.
 */
export const INTENSITY_ACTIVE_SHARE: Record<WorkoutIntensity, number> = {
  LOW: 0.5,
  MEDIUM: 0.75,
  HIGH: 0.9,
};

/**
 * MET saat jeda di sela sesi: berdiri diam. Herrmann SD dkk., 2024 Adult
 * Compendium of Physical Activities, kode 07040 (1,3 MET).
 */
const MET_JEDA = 1.3;

/**
 * kkal BERSIH per menit @70 kg setelah intensitas diperhitungkan.
 *
 * MET efektif = p x MET + (1 - p) x 1,3. Karena kkal bersih per menit linear
 * terhadap (MET - 1), bentuk yang sama berlaku langsung pada kkal per menit,
 * jadi custom workout yang cuma punya kkal/menit (tanpa MET) ikut terhitung:
 *
 *   kkal efektif = p x kkal + (1 - p) x kkal jeda
 *
 * Intensitas null berarti catatan lama atau sesi tanpa pilihan: dianggap
 * bergerak terus, persis seperti sebelum intensitas ada. Ditahan supaya jeda
 * tidak pernah membuat sesi lebih "berat" dari aktivitasnya sendiri.
 */
export const kcalPerMinuteWithIntensity = (
  netKcalPerMinute: number,
  intensity: WorkoutIntensity | null,
): number => {
  if (intensity === null) return netKcalPerMinute;
  const p = INTENSITY_ACTIVE_SHARE[intensity];
  const jeda = netKcalPerMinuteAt70(MET_JEDA);
  return Math.min(netKcalPerMinute, p * netKcalPerMinute + (1 - p) * jeda);
};

/**
 * MET menurut kecepatan, untuk lari dan jalan yang jaraknya diketahui.
 *
 * Titik-titiknya dari Compendium 2011 (Ainsworth dkk.), kode 12xxx untuk lari
 * dan 17xxx untuk jalan di permukaan datar, kecepatan dikonversi dari mph.
 * Di antara dua titik nilainya diinterpolasi linear; di luar tabel ditahan di
 * titik terujung. Lari lebih lambat dari 6,4 km/jam (lari-jalan) memakai titik
 * lari terendah: berlari lambat tetap lebih mahal daripada berjalan secepat itu.
 *
 * Dipakai HANYA kalau kalorinya tidak diketahui. Sesi dari jam tangan membawa
 * kalorinya sendiri dan MET tidak dipakai sama sekali.
 */
const MET_LARI_PER_KM_JAM: [number, number][] = [
  [6.4, 6.0],
  [8.0, 8.3],
  [8.4, 9.0],
  [9.7, 9.8],
  [10.8, 10.5],
  [11.3, 11.0],
  [12.1, 11.5],
  [12.9, 11.8],
  [13.8, 12.3],
  [14.5, 12.8],
  [16.1, 14.5],
  [17.7, 16.0],
  [19.3, 19.0],
  [20.9, 19.8],
  [22.5, 23.0],
];

const MET_JALAN_PER_KM_JAM: [number, number][] = [
  [3.2, 2.8],
  [4.0, 3.0],
  [4.8, 3.5],
  [5.6, 4.3],
  [6.4, 5.0],
  [7.2, 7.0],
  [8.0, 8.3],
];

export const metFromSpeed = (kind: DistanceKind, kmPerHour: number): number => {
  const tabel = kind === 'RUN' ? MET_LARI_PER_KM_JAM : MET_JALAN_PER_KM_JAM;
  const pertama = tabel[0];
  const terakhir = tabel.at(-1);
  if (!pertama || !terakhir) return 1;
  if (kmPerHour <= pertama[0]) return pertama[1];
  if (kmPerHour >= terakhir[0]) return terakhir[1];

  for (let i = 1; i < tabel.length; i++) {
    const kanan = tabel[i];
    const kiri = tabel[i - 1];
    if (!kanan || !kiri) continue;
    if (kmPerHour <= kanan[0]) {
      const t = (kmPerHour - kiri[0]) / (kanan[0] - kiri[0]);
      return round(kiri[1] + t * (kanan[1] - kiri[1]), 2);
    }
  }
  return terakhir[1];
};

/** Kecepatan dari pace. Null kalau pacenya tidak masuk akal. */
export const speedFromPace = (paceSecondsPerKm: number): number | null =>
  paceSecondsPerKm > 0 ? 3600 / paceSecondsPerKm : null;

/**
 * Detik satu ulangan kalau library tidak menyebutkannya sendiri.
 *
 * PERKIRAAN, bukan dari Compendium: tempo yang lazim dianjurkan sekitar satu
 * detik fase angkat dan dua detik fase turun (ACSM, Progression Models in
 * Resistance Training, MSSE 2009), jadi tiga detik per ulangan. Library boleh
 * menimpanya per gerakan (deadlift 4, sit up 2).
 */
export const DETIK_PER_ULANGAN_BAWAAN = 3;

/**
 * Menit GERAK sebuah sesi repetisi atau tahan.
 *
 * Jeda antar set sengaja tidak dihitung: waktu istirahat itu sudah termasuk
 * PAR "sisa hari" di calculateTDEE, dan menghitungnya di sini berarti membayar
 * menit yang sama dua kali. Hasilnya memang kecil (5 push up sekitar 15 detik,
 * sekitar 2 kkal), dan itu jujur: nilai latihan repetisi saat defisit ada di
 * otot yang dipertahankan, bukan di kalorinya.
 */
export const activeMinutesFromReps = (
  sets: number,
  reps: number,
  secondsPerRep: number = DETIK_PER_ULANGAN_BAWAAN,
): number => (sets * reps * secondsPerRep) / 60;

export const activeMinutesFromHold = (sets: number, holdSeconds: number): number =>
  (sets * holdSeconds) / 60;

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
  workoutMinutes: number;
  /**
   * Bagian dari workoutMinutes yang energinya, TERMASUK istirahatnya, sudah
   * dibawa angka kalori TOTAL sesi itu (kalori MANUAL dari jam). Menit ini
   * keluar dari partisi: kalau tetap diberi PAR 1,0, istirahat selama sesi
   * dibayar dua kali, sekali oleh BMR dan sekali di dalam angka total jam.
   */
  coveredMinutes?: number;
}

/**
 * Menghitung PAL satu hari dengan membagi habis 24 jam: tidur, olahraga, dan
 * sisa hari.
 *
 * Jam olahraga diberi PAR 1.0 di sini, BUKAN nilai MET-nya. Yang dihitung di
 * potongan ini hanyalah bagian istirahatnya, biaya kerja di atas istirahat
 * sudah dihitung terpisah sebagai kalori bersih olahraga, lalu dijumlahkan di
 * calculateTDEE. Secara aljabar hasilnya sama dengan memberi potongan itu nilai
 * MET penuh, tapi cara ini tidak memerlukan nilai MET tersimpan di setiap log,
 * sehingga olahraga yang kalorinya diisi manual tetap terhitung benar.
 *
 * Langkah TIDAK punya potongan sendiri lagi. Jalan-jalan kecil sepanjang hari
 * termasuk ke sisa hari, seperti metode faktorial FAO/WHO aslinya. Lihat
 * catatan di bagian LANGKAH.
 */
export const restingPartitionPAL = ({
  activityLevel,
  sleepMinutes,
  workoutMinutes,
  coveredMinutes = 0,
}: PalInput): number => {
  const tidur = Math.max(sleepMinutes ?? TIDUR_DEFAULT_MENIT, 0);
  const olahraga = Math.max(workoutMinutes, 0);
  const tertanggung = Math.min(Math.max(coveredMinutes, 0), olahraga);

  // Data yang tidak masuk akal (tidur 20 jam plus olahraga 6 jam) tidak boleh
  // membuat sisa hari jadi negatif dan menghasilkan PAL yang mustahil.
  const terpakai = Math.min(tidur + olahraga, MENIT_SEHARI);
  const sisa = MENIT_SEHARI - terpakai;

  // Menit yang ditanggung angka total tetap mengurangi sisa hari, tapi tidak
  // dibayar PAR apa pun di sini: energinya sudah ada di angka total itu.
  const berbayar = Math.max(terpakai - tertanggung, 0);

  return round((berbayar * PAR_TIDUR + sisa * ACTIVITY_PAR[activityLevel]) / MENIT_SEHARI, 4);
};

export interface TdeeInput extends PalInput {
  bmr: number;
  /** Kalori bersih olahraga hari itu, dari workout_logs. */
  workoutCalories: number;
}

export interface TdeeBreakdown {
  tdee: number;
  /**
   * PAL sesungguhnya: TDEE dibagi BMR.
   *
   * Sengaja dihitung dari hasil akhir, bukan diambil dari restingPartitionPAL, yang itu
   * cuma potongan istirahatnya dan angkanya selalu lebih rendah.
   * Menampilkan angka setengah jadi dengan nama "PAL" akan menyesatkan siapa pun
   * yang membandingkannya dengan pita FAO/WHO.
   */
  pal: number;
  /** Bagian yang berasal dari metabolisme dan kegiatan sehari-hari. */
  baseline: number;
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
 *
 * Sekarang cuma dua suku: metabolisme dikali PAL, ditambah olahraga tercatat.
 */
export const calculateTDEE = (input: TdeeInput): TdeeBreakdown => {
  const baseline = round(input.bmr * restingPartitionPAL(input), 0);

  const tdee = baseline + input.workoutCalories;

  return {
    tdee,
    pal: input.bmr > 0 ? round(tdee / input.bmr, 3) : 0,
    baseline,
    workout_calories: input.workoutCalories,
  };
};

// ============================================================
// KALORI KELUAR HARIAN, DENGAN ATAU TANPA JAM TANGAN
// ============================================================

/** Angka jam tangan satu hari, seperti tersimpan di device_energy_logs. */
export interface DeviceEnergy {
  total_kcal: number;
  /** Null kalau yang dimasukkan user angka total, bukan kalori aktif. */
  active_kcal: number | null;
}

/**
 * Kalori AKTIF jam tangan hari itu.
 *
 * Kalau user memasukkan kalori aktif, itu yang dipakai. Kalau yang dimasukkan
 * angka total, BMR dikurangkan dulu: angka total jam adalah istirahat (taksiran
 * BMR versi jam) ditambah aktif, dan istirahatnya sudah ditanggung BMR x PAL di
 * rumus. Tidak pernah negatif.
 */
export const activeKcalFromDevice = (device: DeviceEnergy, bmr: number): number =>
  Math.max(Math.round(device.active_kcal ?? device.total_kcal - bmr), 0);

export interface DailyOutInput {
  /** Null selama profil belum diisi atau user belum pernah menimbang. */
  bmr: number | null;
  activityLevel: ActivityLevel;
  /** Menit tidur tercatat. Null berarti belum dicatat, dipakai asumsi 8 jam. */
  sleepMinutes: number | null;
  /** Menit gerak SEMUA olahraga hari itu, terekam jam atau tidak. */
  workoutMinutes: number;
  /**
   * Kalori SEMUA olahraga hari itu: bersih untuk yang dihitung dari MET,
   * total (termasuk istirahat) untuk yang diisi dari jam (MANUAL).
   */
  workoutCalories: number;
  /** Kalori olahraga yang TIDAK dicentang "terekam jam tangan". */
  untrackedWorkoutCalories: number;
  /** Menit olahraga yang kalorinya MANUAL, angka total dari jam. */
  grossWorkoutMinutes?: number;
  /** Sama, tapi hanya yang tidak terekam jam tangan. */
  untrackedGrossWorkoutMinutes?: number;
  /** Angka jam tangan hari itu, null kalau tidak dicatat. */
  device: DeviceEnergy | null;
}

/** Satu sesi olahraga, cukup untuk hitungan kalori keluar. */
export interface WorkoutForOut {
  duration_minutes: number;
  calories_burned: number;
  /** Null di baris yang dibuat sebelum kolomnya ada; semua itu dulu MET. */
  calories_source: CalorieSource | null;
  /** Null di baris lama, artinya tidak terekam jam. */
  tracked_by_device: boolean | null;
}

export type WorkoutDayTotals = Pick<
  DailyOutInput,
  | 'workoutMinutes'
  | 'workoutCalories'
  | 'untrackedWorkoutCalories'
  | 'grossWorkoutMinutes'
  | 'untrackedGrossWorkoutMinutes'
>;

/**
 * Jumlah olahraga satu hari dalam bentuk yang dibutuhkan dailyCaloriesOut().
 * Satu tempat, supaya beranda, riwayat, overview, dan profil energi tidak
 * menjumlahkannya dengan cara masing-masing.
 *
 * Kalori MANUAL dianggap angka TOTAL dari jam (termasuk istirahat selama
 * sesi), sesuai kebiasaan user dan label di form. Menitnya ikut dijumlahkan
 * terpisah supaya dailyCaloriesOut() bisa mengeluarkannya dari partisi.
 */
export const workoutDayTotals = (logs: WorkoutForOut[]): Required<WorkoutDayTotals> => {
  const hasil = {
    workoutMinutes: 0,
    workoutCalories: 0,
    untrackedWorkoutCalories: 0,
    grossWorkoutMinutes: 0,
    untrackedGrossWorkoutMinutes: 0,
  };

  for (const o of logs) {
    const tanpaJam = o.tracked_by_device !== true;
    const total = o.calories_source === 'MANUAL';
    hasil.workoutMinutes += o.duration_minutes;
    hasil.workoutCalories += o.calories_burned;
    if (tanpaJam) hasil.untrackedWorkoutCalories += o.calories_burned;
    if (total) hasil.grossWorkoutMinutes += o.duration_minutes;
    if (total && tanpaJam) hasil.untrackedGrossWorkoutMinutes += o.duration_minutes;
  }

  return hasil;
};

export interface DailyOut {
  calories_out: number;
  source: 'formula' | 'device';
  /** calories_out dibagi BMR. Null kalau BMR belum bisa dihitung. */
  pal: number | null;
  /** BMR x PAL partisi: hidup, pekerjaan, dan gerak kecil sepanjang hari. */
  baseline: number | null;
  /**
   * Kalori olahraga yang BENAR-BENAR dijumlahkan: semua olahraga kalau tanpa
   * angka jam, cuma yang tidak terekam jam kalau ada angka jam.
   */
  workout_calories: number;
  /** Kalori aktif jam yang dijumlahkan. Null kalau hari itu tanpa angka jam. */
  device_active_kcal: number | null;
}

/**
 * Kalori keluar satu hari. SATU-SATUNYA tempat aturan ini ditulis; beranda,
 * riwayat kalori, rekap, dan chat semuanya lewat sini.
 *
 *   Tanpa angka jam : BMR x PAL + semua olahraga
 *   Ada angka jam   : BMR x PAL + kalori aktif jam + olahraga yang tidak terekam jam
 *
 * Angka jam tangan DITAMBAHKAN, bukan menggantikan rumus. Versi lama memakai
 * angka total jam sebagai pengganti seluruh hitungan, dan itu keliru: jam
 * cuma melihat gerak saat dipakai, jadi hari jamnya dilepas jatuh ke sekitar
 * BMR, dan bagian istirahatnya memakai taksiran jam sendiri. Di sini
 * istirahat dan pekerjaan tetap dari BMR x PAL, jam menyumbang gerak yang dia
 * ukur.
 *
 * Olahraga yang dicentang "terekam jam tangan" tidak ditambahkan lagi, karena
 * kalorinya sudah ada di dalam angka aktif jam. Menitnya tetap dihitung PAR
 * 1,0 di partisi, sama seperti tanpa jam, supaya jam yang sama tidak dibayar
 * dua kali oleh PAR pekerjaan.
 *
 * Contoh nyata 30 Sep 2026: BMR 1.866, tidur 350 menit, olahraga 96 menit
 * terekam jam, aktif jam 367. PAL partisi = (350 + 96 + 994 x 1,6) / 1.440
 * = 1,414, jadi 1.866 x 1,414 + 367 = 3.005 kkal.
 *
 * Kalori olahraga MANUAL adalah angka TOTAL dari jam: sudah termasuk
 * istirahat selama sesi. Kalau dijumlahkan, menit sesinya dikeluarkan dari
 * partisi (coveredMinutes), supaya istirahat itu tidak dibayar lagi oleh BMR.
 * Contoh lari 28 Okt 2026: 45 menit, total 360 kkal, BMR 1.876. Metabolisme
 * turun 1.876 x 45 / 1.440 = 59 kkal, olahraga tetap tampil 360.
 *
 * Langkah tetap tidak masuk, lihat catatan LANGKAH di atas.
 */
export const dailyCaloriesOut = (input: DailyOutInput): DailyOut => {
  if (input.bmr === null) {
    // Tanpa profil, metabolisme tidak bisa dihitung. Kalau ada angka total
    // jam, itu yang paling dekat ke kenyataan karena sudah memuat istirahat
    // versi jam. Kalau tidak ada, yang tersisa cuma kalori olahraga: jauh di
    // bawah kenyataan, tapi lebih jujur daripada menebak metabolisme user.
    return input.device === null
      ? {
          calories_out: input.workoutCalories,
          source: 'formula',
          pal: null,
          baseline: null,
          workout_calories: input.workoutCalories,
          device_active_kcal: null,
        }
      : {
          calories_out: input.device.total_kcal + input.untrackedWorkoutCalories,
          source: 'device',
          pal: null,
          baseline: null,
          workout_calories: input.untrackedWorkoutCalories,
          device_active_kcal: null,
        };
  }

  // Menit yang energinya sudah dibawa angka total sesi: hanya sesi yang
  // kalorinya BENAR-BENAR dijumlahkan hari ini. Sesi terekam jam di hari
  // berangka jam tidak dijumlahkan, jadi istirahatnya tetap ditanggung BMR.
  const tertanggung =
    input.device === null
      ? (input.grossWorkoutMinutes ?? 0)
      : (input.untrackedGrossWorkoutMinutes ?? 0);

  const baseline = round(
    input.bmr *
      restingPartitionPAL({
        activityLevel: input.activityLevel,
        sleepMinutes: input.sleepMinutes,
        workoutMinutes: input.workoutMinutes,
        coveredMinutes: tertanggung,
      }),
    0,
  );

  const aktif = input.device === null ? null : activeKcalFromDevice(input.device, input.bmr);
  const olahraga = aktif === null ? input.workoutCalories : input.untrackedWorkoutCalories;
  const keluar = baseline + (aktif ?? 0) + olahraga;

  return {
    calories_out: keluar,
    source: aktif === null ? 'formula' : 'device',
    pal: input.bmr > 0 ? round(keluar / input.bmr, 3) : 0,
    baseline,
    workout_calories: olahraga,
    device_active_kcal: aktif,
  };
};

/**
 * Faktor koreksi timbangan untuk kalori KELUAR.
 *
 * Rumus keluar (BMR x PAL, olahraga, kalori aktif jam) dibandingkan dengan yang
 * terbaca timbangan lewat observeTDEE(). Data pemiliknya 26 Okt 2026: rumus
 * rata-rata 3.174 kkal di hari makan lengkap, timbangan 2.080. Beranda
 * menampilkan defisit 1.440 sehari padahal berat turun 0,31 kg per minggu
 * (sekitar 345), selisih yang membuat semua angka defisit tidak bisa dipercaya.
 *
 * Sasarannya dicampur dengan keyakinan pengukuran, sama seperti jatah, bukan
 * melompat penuh ke hasil ukur, supaya angka harian tidak berayun mengikuti
 * fluktuasi air. Ditahan 0,5 sampai 1,5: di luar itu yang bermasalah datanya.
 *
 * observeTDEE() tidak diubah dan tetap murni makanan dan timbangan. Angka
 * jam tangan cuma ikut di sisi RUMUS yang dibandingkan dengannya.
 *
 * Penyebab selisihnya tidak bisa dipisahkan: rumus atau jam yang kebesaran,
 * atau makanan yang tidak tercatat. Koreksi ini membuat DEFISIT sesuai
 * timbangan; kalau penyebabnya makanan yang terlewat, kalori keluarnya jadi
 * lebih kecil dari yang sebenarnya dibakar.
 */
export const outCorrectionFactor = (input: {
  /** Hasil ukur murni observeTDEE, null kalau belum layak. */
  measured: number | null;
  confidence: number;
  /** Rata-rata kalori keluar versi rumus di hari makan lengkap jendela yang sama. */
  formulaAverage: number;
}): number => {
  if (input.measured === null || input.confidence <= 0 || input.formulaAverage <= 0) return 1;

  const sasaran = input.confidence * input.measured + (1 - input.confidence) * input.formulaAverage;
  return round(Math.min(Math.max(sasaran / input.formulaAverage, 0.5), 1.5), 3);
};

export interface CorrectedOut {
  calories_out: number;
  /** Selisih koreksi dalam kkal (negatif berarti dikurangi). Null kalau tidak dikoreksi. */
  correction: number | null;
}

export const applyOutCorrection = (rawOut: number, factor: number): CorrectedOut => {
  const mentah = Math.round(rawOut);
  if (factor === 1) return { calories_out: mentah, correction: null };

  const hasil = Math.round(rawOut * factor);
  return { calories_out: hasil, correction: hasil - mentah };
};

/**
 * TDEE acuan: hari tanpa olahraga, tidur normal.
 *
 * Ini yang dipakai untuk menghitung budget kalori, karena budget harus stabil.
 * Kalau budget ikut naik-turun mengikuti aktivitas hari itu, user tidak pernah
 * tahu berapa yang boleh dimakan sampai harinya berakhir.
 *
 * Dulu hari acuan ini mengasumsikan 3.000 langkah. Asumsi itu ikut dicabut
 * bersama langkah dari seluruh hitungan, jadi budget-nya turun kira-kira
 * 80-100 kkal untuk orang 80 kg. Angka itu memang tidak seharusnya ada:
 * gerak seadanya sudah terwakili di PAR pekerjaan.
 */
export const baselineTDEE = (bmr: number, activityLevel: ActivityLevel): number =>
  calculateTDEE({
    bmr,
    activityLevel,
    sleepMinutes: null,
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

  return round(baselineTDEE(bmr, input.activityLevel) * (input.tdeeFactor ?? 1), 0);
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
  //
  // Ini anjuran, bukan kredit. Langkah harian tidak masuk calories_out, jadi
  // jalan tambahan itu baru terhitung kalau dicatat sebagai olahraga, atau
  // lewat kalori aktif jam tangan. Secara fisik anjurannya tetap benar: jalan
  // lebih banyak membakar lebih banyak, dan observeTDEE menangkapnya dari
  // berat yang benar-benar turun.
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
