import { lajuPerHari } from '../../utils/observed-tdee.js';
import type { SleepTarget } from '../../utils/targets.js';

/**
 * Overview di beranda: apa yang perlu dibenahi dan apa yang sudah bagus,
 * dibaca dari tujuh hari terakhir dan kemarin. Gula hari ini ikut di sini,
 * dipindah dari layar makanan.
 *
 * Murni tanpa Directus, diuji di overview.test.ts. Datanya disusun
 * getOverview() di summary.service.ts.
 *
 * Aturannya ditulis di kode, bukan diminta dari model. Angkanya harus sama
 * dengan layar lain, tidak boleh berganti tiap kali beranda dibuka, dan tidak
 * boleh memakan kuota Groq di setiap pembukaan. Yang butuh pertimbangan bebas
 * sudah punya tempatnya: chat.
 *
 * Target yang dipakai punya rujukan (utils/targets.ts, plus WHO untuk
 * olahraga). Batas "jauh" dan "kurang" di bawah adalah PERKIRAAN aplikasi ini,
 * bukan angka penelitian, dan ditandai begitu di tempatnya.
 */

export type OverviewKey =
  | 'calories'
  | 'protein'
  | 'sleep'
  | 'water'
  | 'sugar'
  | 'workout'
  | 'weight'
  | 'food_log'
  | 'steps';

/** bad: jauh dari target. warn: perlu dibenahi. good: sudah bagus. */
export type OverviewTone = 'bad' | 'warn' | 'good';

export interface OverviewItem {
  key: OverviewKey;
  tone: OverviewTone;
  title: string;
  /** Angka utama yang sudah diformat, mis. "5j 40m" atau "1,9 L". */
  value: string;
  detail: string;
  /** Capaian terhadap target, bisa lebih dari 1. Null kalau tidak berbentuk progres. */
  progress: number | null;
}

export interface DailyOverview {
  date: string;
  /** Gula yang sudah tercatat hari ini lawan batas atas hariannya. */
  sugar_today: { grams: number; max_g: number };
  /** Yang perlu dibenahi, paling mendesak dulu. */
  improve: OverviewItem[];
  good: OverviewItem[];
}

/** Satu hari kalender WIB di jendela tujuh hari. */
export interface OverviewDay {
  date: string;
  /** Null kalau tidak ada catatan makan hari itu. */
  calories_in: number | null;
  /** Ditandai user belum lengkap: tidak ikut rata-rata makan apa pun. */
  incomplete: boolean;
  calories_out: number;
  protein_g: number;
  sugar_g: number;
  water_ml: number;
  water_target_ml: number;
  /** Null kalau langkah hari itu tidak dicatat. */
  steps: number | null;
  workout_minutes: number;
}

export interface OverviewInput {
  today: string;
  /** Tujuh hari penuh sebelum hari ini, urut naik. Yang terakhir kemarin. */
  days: OverviewDay[];
  sugarToday: number;
  /**
   * Tidur per tanggal tidur untuk tujuh tanggal sampai HARI INI, yang
   * tercatat saja. Tanggal tidur hari ini adalah tidur semalam (sleepDay).
   */
  nights: { date: string; minutes: number }[];
  sleepTarget: SleepTarget;
  stepTarget: number;
  /** Null selama belum ada jatah kalori aktif. */
  proteinTarget: number | null;
  sugarMax: number;
  budget: number | null;
  /** Penimbangan dari tujuh hari lalu sampai hari ini. */
  weights: { date: string; kg: number }[];
  /** Laju rencana, kg per minggu, positif. Null tanpa rencana otomatis. */
  plannedWeeklyRate: number | null;
  /** True kalau targetnya menurunkan berat. Null tanpa target. */
  losing: boolean | null;
}

// ============================================================
// BATAS
// ============================================================

/** Rata-rata di bawah porsi target ini dianggap jauh dari target. Perkiraan aplikasi. */
const JAUH = 0.6;
/** Rata-rata di bawah porsi target ini dianggap kurang. Perkiraan aplikasi. */
const KURANG = 0.85;
/**
 * Tidur di bawah enam jam: "not recommended" untuk dewasa, bukan cuma kurang.
 * Hirshkowitz M dkk. Sleep Health 2015;1(1):40-43.
 */
const TIDUR_TERLALU_SEDIKIT = 6 * 60;
/**
 * Aktivitas aerobik intensitas sedang minimal 150 menit per minggu untuk
 * dewasa. WHO, Guidelines on physical activity and sedentary behaviour, 2020.
 */
const OLAHRAGA_ANJURAN_MENIT = 150;
/** Kelonggaran sebelum dihitung lewat jatah; catatan makan tidak setepat itu. Perkiraan. */
const TOLERANSI_JATAH = 100;
/** Rata-rata asupan sejauh ini di bawah jatah dianggap terlalu sedikit. Perkiraan. */
const TERLALU_DI_BAWAH_JATAH = 500;
/** Gula kemarin di atas 1,5 kali batas dihitung jauh. Perkiraan. */
const GULA_JAUH = 1.5;
/**
 * observeTDEE() menolak menghitung di bawah 70% hari tercatat. Tujuh hari
 * dikali 0,7 dibulatkan ke atas.
 */
const MIN_HARI_MAKAN = 5;
/** Laju berat di bawah ini dianggap datar, kg per minggu. Perkiraan. */
const DATAR_KG = 0.1;
/** Tren berat butuh penimbangan yang cukup rapat dan cukup panjang. */
const MIN_TIMBANG = 4;
const MIN_RENTANG_TIMBANG_HARI = 5;

/** Urutan tampil di dalam satu tingkat keparahan: yang paling menentukan berat dulu. */
const URUTAN: OverviewKey[] = [
  'calories',
  'protein',
  'sleep',
  'water',
  'sugar',
  'workout',
  'weight',
  'food_log',
  'steps',
];

// ============================================================
// FORMAT, SAMA DENGAN utils/format.ts DI MOBILE DAN WEB
// ============================================================

const ribuan = (n: number): string => {
  const bulat = Math.round(n);
  return (bulat < 0 ? '-' : '') + String(Math.abs(bulat)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// Dibulatkan dulu: (0.95).toFixed(1) memberi 0.9 karena 0,95 tidak persis di biner.
const koma = (n: number, digit = 1): string =>
  (Math.round(n * 10 ** digit) / 10 ** digit).toFixed(digit).replace('.', ',');

const durasi = (menit: number): string => {
  const m = Math.round(menit);
  if (m <= 0) return '0m';
  const j = Math.floor(m / 60);
  const sisa = m % 60;
  if (j === 0) return `${sisa}m`;
  return sisa === 0 ? `${j}j` : `${j}j ${sisa}m`;
};

const liter = (ml: number): string =>
  ml >= 1000 ? `${koma(ml / 1000)} L` : `${String(Math.round(ml))} ml`;

const jam = (menit: number): string => koma(menit / 60, menit % 60 === 0 ? 0 : 1);

const rata = (nilai: number[]): number =>
  nilai.length === 0 ? 0 : nilai.reduce((a, b) => a + b, 0) / nilai.length;

const progres = (nilai: number, target: number): number | null =>
  target > 0 ? Math.round((nilai / target) * 100) / 100 : null;

const tingkat = (rasio: number): OverviewTone =>
  rasio < JAUH ? 'bad' : rasio < KURANG ? 'warn' : 'good';

type HariMakan = OverviewDay & { calories_in: number };

/** Hari yang makannya tercatat dan tidak ditandai belum lengkap. */
const lengkap = (d: OverviewDay): d is HariMakan => d.calories_in !== null && !d.incomplete;

const kemarinDari = (input: OverviewInput): OverviewDay | undefined => input.days.at(-1);

// ============================================================
// ATURAN PER METRIK
// ============================================================

const kalori = (input: OverviewInput): OverviewItem | null => {
  const jatah = input.budget;
  if (jatah === null) return null;

  const hari = input.days.filter(lengkap);
  if (hari.length === 0) return null;

  const n = hari.length;
  const rataMasuk = rata(hari.map((d) => d.calories_in));
  const rataDefisit = rata(hari.map((d) => d.calories_out - d.calories_in));
  const lewat = hari.filter((d) => d.calories_in > jatah + TOLERANSI_JATAH).length;
  const kemarin = kemarinDari(input);

  if (kemarin && lengkap(kemarin) && kemarin.calories_in > jatah + TOLERANSI_JATAH) {
    return {
      key: 'calories',
      tone: 'warn',
      title: 'Kemarin lewat jatah',
      value: `+${ribuan(kemarin.calories_in - jatah)} kkal`,
      detail:
        `Kemarin ${ribuan(kemarin.calories_in)} kkal dari jatah ${ribuan(jatah)}.` +
        (lewat > 1 ? ` Lewat jatah ${String(lewat)} dari ${String(n)} hari tercatat.` : ''),
      progress: progres(kemarin.calories_in, jatah),
    };
  }

  if (n < 3) return null;

  if (lewat >= 3) {
    return {
      key: 'calories',
      tone: 'warn',
      title: 'Sering lewat jatah',
      value: `${String(lewat)} hari`,
      detail: `Lewat jatah ${ribuan(jatah)} kkal di ${String(lewat)} dari ${String(n)} hari tercatat. Rata-rata ${ribuan(rataMasuk)} kkal per hari.`,
      progress: progres(rataMasuk, jatah),
    };
  }

  if (rataMasuk < jatah - TERLALU_DI_BAWAH_JATAH) {
    return {
      key: 'calories',
      tone: 'warn',
      title: 'Makan jauh di bawah jatah',
      value: `${ribuan(rataMasuk)} kkal`,
      detail: `Rata-rata per hari, ${ribuan(jatah - rataMasuk)} di bawah jatah ${ribuan(jatah)} (${String(n)} hari tercatat). Defisit sebesar ini lebih berisiko memangkas otot.`,
      progress: progres(rataMasuk, jatah),
    };
  }

  return {
    key: 'calories',
    tone: 'good',
    title: 'Makan sesuai jatah',
    value: `${ribuan(rataMasuk)} kkal`,
    detail:
      `Rata-rata per hari, jatah ${ribuan(jatah)} (${String(n)} hari tercatat).` +
      (rataDefisit > 0 ? ` Defisit rata-rata ${ribuan(rataDefisit)} kkal per hari.` : ''),
    progress: progres(rataMasuk, jatah),
  };
};

const protein = (input: OverviewInput): OverviewItem | null => {
  const target = input.proteinTarget;
  if (target === null || target <= 0) return null;

  const hari = input.days.filter(lengkap);
  if (hari.length < 2) return null;

  const rataProtein = rata(hari.map((d) => d.protein_g));
  const tone = tingkat(rataProtein / target);
  const kemarin = kemarinDari(input);
  const catatanKemarin =
    kemarin && lengkap(kemarin) ? ` Kemarin ${ribuan(kemarin.protein_g)} g.` : '';

  return {
    key: 'protein',
    tone,
    title: tone === 'good' ? 'Protein cukup' : 'Protein kurang',
    value: `${ribuan(rataProtein)} g`,
    detail:
      tone === 'good'
        ? `Rata-rata per hari dari target ${ribuan(target)} g (${String(hari.length)} hari tercatat).`
        : `Rata-rata per hari dari target ${ribuan(target)} g, kurang ${ribuan(target - rataProtein)} g.${catatanKemarin}`,
    progress: progres(rataProtein, target),
  };
};

const tidur = (input: OverviewInput): OverviewItem | null => {
  const malam = input.nights.filter((m) => m.minutes > 0);
  if (malam.length < 2) return null;

  const { min_minutes: min, max_minutes: max } = input.sleepTarget;
  const rataTidur = rata(malam.map((m) => m.minutes));
  const tone: OverviewTone =
    rataTidur < TIDUR_TERLALU_SEDIKIT ? 'bad' : rataTidur < min ? 'warn' : 'good';

  const semalam = input.nights.find((m) => m.date === input.today);
  const catatanSemalam = semalam ? ` Semalam ${durasi(semalam.minutes)}.` : '';
  const n = String(malam.length);

  return {
    key: 'sleep',
    tone,
    title: tone === 'good' ? 'Tidur cukup' : 'Tidur kurang',
    value: durasi(rataTidur),
    detail:
      tone === 'good'
        ? `Rata-rata dari ${n} malam tercatat, target ${jam(min)} sampai ${jam(max)} jam.${catatanSemalam}`
        : `Rata-rata dari ${n} malam tercatat, kurang ${durasi(min - rataTidur)} dari ${jam(min)} jam.${catatanSemalam}`,
    progress: progres(rataTidur, min),
  };
};

const air = (input: OverviewInput): OverviewItem | null => {
  // Hari tanpa catatan minum bukan hari tidak minum, sama seperti makanan.
  const hari = input.days.filter((d) => d.water_ml > 0 && d.water_target_ml > 0);
  if (hari.length === 0) return null;

  const rataAir = rata(hari.map((d) => d.water_ml));
  const rataTarget = rata(hari.map((d) => d.water_target_ml));
  const tone = tingkat(rata(hari.map((d) => d.water_ml / d.water_target_ml)));
  const kemarin = kemarinDari(input);
  const catatanKemarin =
    kemarin && kemarin.water_ml > 0 ? ` Kemarin ${liter(kemarin.water_ml)}.` : '';

  return {
    key: 'water',
    tone,
    title: tone === 'good' ? 'Minum cukup' : 'Kurang minum',
    value: liter(rataAir),
    detail: `Rata-rata per hari dari target sekitar ${liter(rataTarget)} (${String(hari.length)} hari tercatat).${catatanKemarin}`,
    progress: progres(rataAir, rataTarget),
  };
};

const gula = (input: OverviewInput): OverviewItem | null => {
  const batas = input.sugarMax;
  const hari = input.days.filter(lengkap);
  if (hari.length === 0 || batas <= 0) return null;

  const n = String(hari.length);
  const lewat = hari.filter((d) => d.sugar_g > batas).length;
  const kemarin = kemarinDari(input);

  if (kemarin && lengkap(kemarin) && kemarin.sugar_g > batas) {
    return {
      key: 'sugar',
      tone: kemarin.sugar_g > batas * GULA_JAUH ? 'bad' : 'warn',
      title: 'Gula kemarin lewat batas',
      value: `${ribuan(kemarin.sugar_g)} g`,
      detail:
        `Batas ${String(batas)} g per hari.` +
        (lewat > 1 ? ` Lewat batas ${String(lewat)} dari ${n} hari tercatat.` : ''),
      progress: progres(kemarin.sugar_g, batas),
    };
  }

  if (lewat >= 2) {
    return {
      key: 'sugar',
      tone: 'warn',
      title: 'Gula sering lewat batas',
      value: `${String(lewat)} hari`,
      detail: `Lewat batas ${String(batas)} g di ${String(lewat)} dari ${n} hari tercatat.`,
      progress: null,
    };
  }

  if (hari.length < 3) return null;

  const rataGula = rata(hari.map((d) => d.sugar_g));
  return {
    key: 'sugar',
    tone: 'good',
    title: 'Gula aman',
    value: `${ribuan(rataGula)} g`,
    detail: `Rata-rata per hari, batas ${String(batas)} g (${n} hari tercatat).`,
    progress: progres(rataGula, batas),
  };
};

const olahraga = (input: OverviewInput): OverviewItem => {
  const total = input.days.reduce((s, d) => s + d.workout_minutes, 0);
  const hari = input.days.filter((d) => d.workout_minutes > 0).length;

  if (total >= OLAHRAGA_ANJURAN_MENIT) {
    return {
      key: 'workout',
      tone: 'good',
      title: 'Olahraga cukup',
      value: durasi(total),
      detail: `${String(hari)} hari dalam 7 hari terakhir. Anjuran WHO minimal 150 menit per minggu.`,
      progress: progres(total, OLAHRAGA_ANJURAN_MENIT),
    };
  }

  return {
    key: 'workout',
    tone: 'warn',
    title: total === 0 ? 'Belum ada olahraga' : 'Olahraga kurang',
    value: durasi(total),
    detail:
      total === 0
        ? 'Dalam 7 hari terakhir. Anjuran WHO minimal 150 menit per minggu, misalnya jalan cepat 30 menit lima kali.'
        : `Dalam 7 hari terakhir. Anjuran WHO minimal 150 menit per minggu, kurang ${durasi(OLAHRAGA_ANJURAN_MENIT - total)}.`,
    progress: progres(total, OLAHRAGA_ANJURAN_MENIT),
  };
};

const berat = (input: OverviewInput): OverviewItem | null => {
  if (input.losing === null || input.weights.length < MIN_TIMBANG) return null;

  const tanggal = input.weights.map((w) => w.date).sort();
  const awal = tanggal[0];
  const akhir = tanggal.at(-1);
  if (!awal || !akhir) return null;
  const rentang =
    (new Date(`${akhir}T00:00:00Z`).getTime() - new Date(`${awal}T00:00:00Z`).getTime()) /
    86_400_000;
  if (rentang < MIN_RENTANG_TIMBANG_HARI) return null;

  // Regresi atas semua penimbangan, bukan selisih dua ujung: berat berayun
  // satu sampai dua kilo hanya karena air dan isi perut.
  const laju = lajuPerHari(input.weights);
  if (laju === null) return null;

  const perMinggu = laju * 7;
  // Positif berarti bergerak ke arah target.
  const maju = input.losing ? -perMinggu : perMinggu;
  const besar = `${koma(Math.abs(perMinggu))} kg/minggu`;

  if (maju >= DATAR_KG) {
    const rencana =
      input.plannedWeeklyRate !== null && input.plannedWeeklyRate > 0
        ? `, rencana ${koma(input.plannedWeeklyRate)} kg per minggu`
        : '';
    return {
      key: 'weight',
      tone: 'good',
      title: input.losing ? 'Berat turun' : 'Berat naik',
      value: besar,
      detail: `Tren ${String(input.weights.length)} penimbangan 7 hari terakhir${rencana}.`,
      progress: null,
    };
  }

  if (maju > -DATAR_KG) {
    return {
      key: 'weight',
      tone: 'warn',
      title: 'Berat datar',
      value: 'Datar',
      detail:
        'Tren 7 hari terakhir hampir datar. Kalau berlanjut dua minggu, cek lagi catatan makan.',
      progress: null,
    };
  }

  return {
    key: 'weight',
    tone: 'warn',
    title: input.losing ? 'Berat naik' : 'Berat turun',
    value: besar,
    detail:
      'Tren 7 hari terakhir menjauhi target. Naik turun 1 sampai 2 kg karena air itu biasa, lihat lagi minggu depan.',
    progress: null,
  };
};

const catatanMakan = (input: OverviewInput): OverviewItem | null => {
  const tercatat = input.days.filter(lengkap).length;
  if (tercatat >= MIN_HARI_MAKAN) return null;

  return {
    key: 'food_log',
    tone: 'warn',
    title: 'Catatan makan bolong',
    value: `${String(tercatat)} dari 7 hari`,
    detail:
      'TDEE terukur butuh minimal 70% hari tercatat. Hari yang kelewat bisa diisi lewat kalender di layar makanan.',
    progress: progres(tercatat, 7),
  };
};

const langkah = (input: OverviewInput): OverviewItem | null => {
  // Langkah cuma pantauan, jadi tidak pernah merah, dan tidak dibahas kalau
  // memang tidak pernah dicatat.
  const hari = input.days.filter((d): d is OverviewDay & { steps: number } => (d.steps ?? 0) > 0);
  if (hari.length === 0 || input.stepTarget <= 0) return null;

  const rataLangkah = rata(hari.map((d) => d.steps));
  const tone: OverviewTone = rataLangkah / input.stepTarget < KURANG ? 'warn' : 'good';
  const kemarin = kemarinDari(input);
  const catatanKemarin =
    kemarin?.steps !== null && kemarin?.steps !== undefined && kemarin.steps > 0
      ? ` Kemarin ${ribuan(kemarin.steps)}.`
      : '';

  return {
    key: 'steps',
    tone,
    title: tone === 'good' ? 'Langkah tercapai' : 'Langkah kurang',
    value: ribuan(rataLangkah),
    detail: `Rata-rata per hari dari target ${ribuan(input.stepTarget)} (${String(hari.length)} hari tercatat).${catatanKemarin}`,
    progress: progres(rataLangkah, input.stepTarget),
  };
};

// ============================================================
// SUSUNAN
// ============================================================

const urutKunci = (a: OverviewItem, b: OverviewItem): number =>
  URUTAN.indexOf(a.key) - URUTAN.indexOf(b.key);

export const susunOverview = (input: OverviewInput): DailyOverview => {
  const semua = [
    kalori(input),
    protein(input),
    tidur(input),
    air(input),
    gula(input),
    olahraga(input),
    berat(input),
    catatanMakan(input),
    langkah(input),
  ].filter((item): item is OverviewItem => item !== null);

  return {
    date: input.today,
    sugar_today: { grams: Math.round(input.sugarToday * 10) / 10, max_g: input.sugarMax },
    improve: semua
      .filter((i) => i.tone !== 'good')
      .sort((a, b) => (a.tone === b.tone ? urutKunci(a, b) : a.tone === 'bad' ? -1 : 1)),
    good: semua.filter((i) => i.tone === 'good').sort(urutKunci),
  };
};
