import { round } from './number.js';

/**
 * Menurunkan TDEE dari data yang BENAR-BENAR terjadi, bukan dari rumus.
 *
 * Semua perhitungan energi lain di aplikasi ini adalah estimasi populasi.
 * Mifflin-St Jeor diturunkan dari 498 orang; PAL 1.4 adalah rata-rata orang yang
 * pekerjaannya mirip. Tidak satu pun tahu apa-apa tentang metabolisme user ini.
 *
 * Padahal kekekalan energi berlaku ke belakang juga. Kalau kita tahu berapa yang
 * dimakan dan berapa beratnya berubah, TDEE bisa DIHITUNG MUNDUR:
 *
 *   TDEE = (total_asupan - perubahan_berat_kg x 7700) / jumlah_hari
 *
 * yang setelah disederhanakan jadi bentuk yang dipakai di bawah:
 *
 *   TDEE = rata_asupan_harian - (laju_kg_per_hari x 7700)
 *
 * ---
 *
 * SOAL CATATAN MAKANAN YANG TIDAK AKURAT
 *
 * Orang secara konsisten mencatat makanan lebih sedikit daripada kenyataan, penelitian
 * menunjukkan kekurangan 20-30%. Itu TIDAK membuat pendekatan ini
 * sia-sia, tapi juga tidak sepenuhnya saling meniadakan seperti yang mudah
 * diduga. Yang terjadi:
 *
 *   TDEE_terukur = TDEE_sebenarnya - (1 - f) x asupan_sebenarnya
 *
 * dengan f = rasio yang tercatat. Artinya kekurangan catatan membuat TDEE
 * terukur JATUH DI BAWAH yang sebenarnya, sehingga jatah kalorinya jadi lebih
 * ketat dan defisit yang benar-benar terjadi lebih BESAR dari yang direncanakan.
 *
 * Meleset, tapi meleset ke arah yang aman: user turun lebih cepat dari perkiraan,
 * bukan diam-diam tidak turun sama sekali. Itu jauh lebih baik daripada rumus,
 * yang bisa meleset ke arah sebaliknya tanpa pernah ketahuan.
 */

/** Energi per kg jaringan tubuh. Lihat catatan di calories.ts. */
const KALORI_PER_KG = 7700;

/** Jendela pengamatan tidak boleh lebih pendek dari ini. */
const MIN_HARI = 14;

/** Penimbangan minimal supaya garis trennya punya arti. */
const MIN_PENIMBANGAN = 6;

/** Jarak antara penimbangan pertama dan terakhir, supaya tren tidak diekstrapolasi. */
const MIN_RENTANG_TIMBANG = 10;

/** Porsi hari yang harus tercatat makanannya. */
const MIN_CAKUPAN = 0.7;

/**
 * Batas kewajaran hasil pengukuran terhadap estimasi rumus.
 *
 * Di luar rentang ini yang jauh lebih mungkin adalah datanya kacau, bukan
 * metabolisme yang benar-benar seekstrem itu. Menerima begitu saja akan
 * menghasilkan jatah kalori yang berbahaya.
 */
const BATAS_BAWAH_RASIO = 0.6;
const BATAS_ATAS_RASIO = 1.7;

/**
 * Bobot maksimal untuk hasil pengukuran.
 *
 * Sengaja tidak sampai 1.0. Pengukurannya bergantung pada ketelitian mencatat
 * makanan, yang kita tahu bias; menyerahkan angkanya sepenuhnya ke sana berarti
 * jatah kalori jadi sandera kualitas catatan. Estimasi rumus disisakan sebagai
 * jangkar kecil yang menahan ayunan paling liar.
 */
const BOBOT_MAKSIMAL = 0.85;

/** Berapa hari sampai jendela pengamatan dianggap cukup panjang. */
const HARI_PENUH = 28;

/** Penimbangan per hari yang dianggap ideal, kira-kira dua kali seminggu. */
const TIMBANG_IDEAL_PER_HARI = 2 / 7;

export interface WeightPoint {
  /** YYYY-MM-DD */
  date: string;
  kg: number;
}

export interface ObservedInput {
  /** Penimbangan dalam jendela pengamatan, urutan bebas. */
  weights: WeightPoint[];
  /** Total kalori masuk per tanggal. Hari tanpa catatan TIDAK boleh ikut sebagai nol. */
  intakeByDate: Map<string, number>;
  /** Panjang jendela pengamatan dalam hari. */
  days: number;
  /** Estimasi dari rumus, dipakai sebagai jangkar dan pembanding kewajaran. */
  estimated: number;
}

export type ObservedReason =
  | 'BELUM_CUKUP_HARI'
  | 'BELUM_CUKUP_TIMBANGAN'
  | 'RENTANG_TIMBANG_PENDEK'
  | 'CATATAN_MAKAN_KURANG'
  | 'HASIL_TIDAK_WAJAR';

export interface ObservedTdee {
  /** Angka yang dipakai: campuran hasil pengukuran dan estimasi rumus. */
  tdee: number;
  /**
   * Hasil murni rumus, sebelum dikoreksi apa pun.
   *
   * Ikut dikembalikan supaya pemanggil bisa menurunkan rasio koreksinya tanpa
   * membalik aljabar pencampuran, cara itu pernah gua tulis dan hasilnya
   * berbelit sekaligus rapuh terhadap pembagian nol saat confidence bernilai 1.
   */
  estimated: number;
  /** Hasil murni pengukuran. Null selama datanya belum layak. */
  measured: number | null;
  /** 0 sampai 1, seberapa besar bobot pengukuran di dalam `tdee`. */
  confidence: number;
  /** Kenapa pengukuran belum dipakai. Null kalau sudah dipakai. */
  reason: ObservedReason | null;
  days: number;
  /** Berapa hari dari jendela itu yang makanannya tercatat. */
  logged_days: number;
  weigh_ins: number;
  /** Laju perubahan berat hasil regresi, kg per minggu. Negatif berarti turun. */
  weekly_rate_kg: number | null;
}

/**
 * Laju perubahan berat lewat regresi linear, dalam kg per hari.
 *
 * Dipilih daripada sekadar mengurangi penimbangan terakhir dengan yang pertama.
 * Berat badan berayun satu sampai dua kilo hanya karena air, garam, dan isi
 * perut; dua titik ujung membuat seluruh kesimpulan bergantung pada kebetulan
 * kondisi dua hari itu. Regresi memakai SEMUA penimbangan, jadi ayunannya
 * saling meredam.
 */
const lajuPerHari = (weights: WeightPoint[]): number | null => {
  if (weights.length < 2) return null;

  const urut = [...weights].sort((a, b) => a.date.localeCompare(b.date));

  const pertama = urut[0];
  if (!pertama) return null;

  const awal = new Date(`${pertama.date}T00:00:00Z`).getTime();

  const titik = urut.map((w) => ({
    x: (new Date(`${w.date}T00:00:00Z`).getTime() - awal) / 86_400_000,
    y: w.kg,
  }));

  const n = titik.length;
  const rerataX = titik.reduce((s, p) => s + p.x, 0) / n;
  const rerataY = titik.reduce((s, p) => s + p.y, 0) / n;

  let atas = 0;
  let bawah = 0;

  for (const p of titik) {
    atas += (p.x - rerataX) * (p.y - rerataY);
    bawah += (p.x - rerataX) ** 2;
  }

  // Semua penimbangan jatuh di tanggal yang sama: tidak ada tren untuk dibaca.
  if (bawah === 0) return null;

  return atas / bawah;
};

/** Jarak hari antara penimbangan pertama dan terakhir. */
const rentangTimbang = (weights: WeightPoint[]): number => {
  const tanggal = weights.map((w) => w.date).sort();
  const awal = tanggal[0];
  const akhir = tanggal[tanggal.length - 1];

  if (!awal || !akhir) return 0;

  return Math.round(
    (new Date(`${akhir}T00:00:00Z`).getTime() - new Date(`${awal}T00:00:00Z`).getTime()) /
      86_400_000,
  );
};

const gagal = (
  reason: ObservedReason,
  input: ObservedInput,
  laju: number | null,
): ObservedTdee => ({
  tdee: input.estimated,
  estimated: input.estimated,
  measured: null,
  confidence: 0,
  reason,
  days: input.days,
  logged_days: input.intakeByDate.size,
  weigh_ins: input.weights.length,
  weekly_rate_kg: laju === null ? null : round(laju * 7, 3),
});

/**
 * Menghitung TDEE terukur, lalu mencampurnya dengan estimasi rumus.
 *
 * Campuran, bukan penggantian. Melompat penuh ke hasil empat belas hari akan
 * membuat jatah kalori user berayun tiap minggu mengikuti fluktuasi air, bobotnya naik
 * perlahan seiring datanya bertambah panjang dan rapat.
 */
export const observeTDEE = (input: ObservedInput): ObservedTdee => {
  const laju = lajuPerHari(input.weights);

  if (input.days < MIN_HARI) return gagal('BELUM_CUKUP_HARI', input, laju);
  if (input.weights.length < MIN_PENIMBANGAN) return gagal('BELUM_CUKUP_TIMBANGAN', input, laju);

  if (laju === null || rentangTimbang(input.weights) < MIN_RENTANG_TIMBANG) {
    return gagal('RENTANG_TIMBANG_PENDEK', input, laju);
  }

  const hariTercatat = input.intakeByDate.size;
  const cakupan = hariTercatat / input.days;

  if (cakupan < MIN_CAKUPAN) return gagal('CATATAN_MAKAN_KURANG', input, laju);

  const totalKalori = [...input.intakeByDate.values()].reduce((s, v) => s + v, 0);
  const rataAsupan = totalKalori / hariTercatat;

  // TDEE = rata asupan - (laju kg/hari x 7700). Laju negatif saat turun, jadi
  // sukunya menambah, energi yang hilang dari tubuh itu yang ikut dibakar.
  const terukur = round(rataAsupan - laju * KALORI_PER_KG, 0);

  if (
    terukur < input.estimated * BATAS_BAWAH_RASIO ||
    terukur > input.estimated * BATAS_ATAS_RASIO
  ) {
    return gagal('HASIL_TIDAK_WAJAR', input, laju);
  }

  // Tiga penentu keyakinan: panjang jendela, kerapatan penimbangan, dan cakupan
  // catatan makan. Dikalikan, jadi yang paling lemah menentukan, memang begitu
  // seharusnya, karena satu saja yang buruk sudah cukup merusak hasilnya.
  const bobotHari = Math.min(input.days / HARI_PENUH, 1);
  const bobotTimbang = Math.min(input.weights.length / (input.days * TIMBANG_IDEAL_PER_HARI), 1);
  const bobotCakupan = Math.min((cakupan - MIN_CAKUPAN) / (1 - MIN_CAKUPAN), 1);

  const confidence = round(
    Math.min(bobotHari * bobotTimbang * (0.5 + 0.5 * bobotCakupan), BOBOT_MAKSIMAL),
    3,
  );

  return {
    tdee: round(input.estimated + (terukur - input.estimated) * confidence, 0),
    estimated: input.estimated,
    measured: terukur,
    confidence,
    reason: null,
    days: input.days,
    logged_days: hariTercatat,
    weigh_ins: input.weights.length,
    weekly_rate_kg: round(laju * 7, 3),
  };
};
