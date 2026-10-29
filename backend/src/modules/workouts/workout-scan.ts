import type { DistanceKind, WorkoutMeasure } from '../../constants/enums.js';

/**
 * Isi form olahraga dari screenshot aplikasi jam atau aplikasi lari.
 *
 * Murni tanpa Directus dan tanpa Groq, diuji di workout-scan.test.ts.
 * Model cuma MEMBACA angka yang tertulis; yang menghitung, mengoreksi satuan,
 * mencocokkan, dan memeriksa silang adalah kode di sini. Pelajaran yang sama
 * dengan analisa makanan: aturan di prompt bisa dilanggar, kode tidak.
 *
 * Tidak ada yang tersimpan dari sini. Hasilnya mengisi form, user yang
 * memeriksa dan menekan Simpan.
 */

/** Baris library yang boleh dipilih model, urutannya = nomor di prompt. */
export interface PilihanLibrary {
  id: string;
  name: string;
  measure: WorkoutMeasure;
  distance_kind: DistanceKind | null;
}

export interface WorkoutScanResult {
  workout_library_id: string | null;
  /** Nama dari library kalau cocok, kalau tidak nama aktivitas di layar. */
  workout_name: string | null;
  /** Nama aktivitas apa adanya di screenshot, mis. "Outdoor run". */
  activity_label: string | null;
  distance_kind: DistanceKind | null;
  measure: WorkoutMeasure | null;
  logged_at: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  distance_km: number | null;
  pace_seconds_per_km: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cadence: number | null;
  step_count: number | null;
  elevation_gain_m: number | null;
  training_effect: number | null;
  /**
   * Kalori TOTAL sesi, angka yang biasa diisi user (termasuk istirahat
   * selama sesi). Kalau layar cuma menampilkan kalori aktif, istirahatnya
   * ditambahkan dari BMR supaya tetap satu jenis angka.
   */
  calories_total: number | null;
  /** Peringatan yang perlu dicek user sebelum menyimpan. */
  warnings: string[];
}

export const workoutScanPrompt = (pilihan: PilihanLibrary[], today: string): string => {
  const daftar = pilihan.map((p, i) => `${i + 1}. ${p.name}`).join('\n');

  return `These are screenshots from a fitness tracker or running app showing ONE workout session. If there are several screenshots, they are different tabs of the same session: combine them.

Read the numbers EXACTLY as shown for this session. Do not estimate, do not calculate, do not convert anything except where stated below. Use null for anything that is not visible.

Ignore totals that are not about this session, such as "You've already burned 1,530 kcal this week" or daily step goals.

Rules:
- duration_seconds: the session duration. "00:44:45" or "44:45" means 44 minutes 45 seconds = 2685. "1:02:03" means 1 hour 2 minutes 3 seconds = 3723.
- pace_seconds_per_km: average pace. 11'24" or 11:24 /km means 684. If the pace is per mile, convert to per km by dividing by 1.609344.
- distance_km: if the distance is in miles, multiply by 1.609344. If it is in meters (pool swimming), divide by 1000.
- total_kcal: "Total calories" or a single "Calories" value. active_kcal: "Active calories". Never put the same number in both unless both are shown.
- training_effect: aerobic training effect or aerobic training stress (about 0 to 5).
- date: the session date as YYYY-MM-DD. Today is ${today}; if the year is missing, use the most recent such date that is not after today.
- start_time: session start time as HH:MM (24 hour), if shown.
- activity: the activity name exactly as written, e.g. "Outdoor run".
- library_index: the number of the closest activity from this list, or null if none fits. Running or jogging of any kind is "Lari", walking is "Jalan":
${daftar}

Return ONLY a JSON object:
{
  "activity": "string" | null,
  "library_index": number | null,
  "date": "YYYY-MM-DD" | null,
  "start_time": "HH:MM" | null,
  "duration_seconds": number | null,
  "distance_km": number | null,
  "pace_seconds_per_km": number | null,
  "avg_hr": number | null,
  "max_hr": number | null,
  "avg_cadence": number | null,
  "steps": number | null,
  "elevation_gain_m": number | null,
  "total_kcal": number | null,
  "active_kcal": number | null,
  "training_effect": number | null
}`;
};

/** Angka dari model, null kalau bukan angka atau di luar rentang yang masuk akal. */
const angka = (nilai: unknown, min: number, max: number): number | null => {
  const n = typeof nilai === 'string' ? Number(nilai.replace(',', '.')) : nilai;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const bulat = (nilai: number | null): number | null => (nilai === null ? null : Math.round(nilai));

const teks = (nilai: unknown): string | null =>
  typeof nilai === 'string' && nilai.trim() !== '' ? nilai.trim().slice(0, 255) : null;

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Pace dibaca dari aplikasi, dan banyak aplikasi menghitungnya dari waktu
 * BERGERAK. Jadi pace x jarak boleh lebih pendek dari durasi (ada jeda),
 * tapi tidak boleh lebih panjang: itu tanda salah baca. Toleransi 3% plus
 * 10 detik untuk pembulatan tampilan (11'24" dari 11'24,9").
 */
const TOLERANSI_PACE = 1.03;
/** Waktu bergerak di bawah separuh durasi: jedanya terlalu panjang untuk wajar. */
const BATAS_JEDA = 0.5;

export const normalisasiScan = (
  raw: Record<string, unknown>,
  pilihan: PilihanLibrary[],
  today: string,
  bmr: number | null,
): WorkoutScanResult => {
  const peringatan: string[] = [];

  const indeks = angka(raw.library_index, 1, pilihan.length);
  const cocok = indeks === null ? null : (pilihan[Math.round(indeks) - 1] ?? null);
  const label = teks(raw.activity);

  let tanggal = typeof raw.date === 'string' && POLA_TANGGAL.test(raw.date) ? raw.date : null;
  if (tanggal !== null && tanggal > today) {
    peringatan.push('Tanggal di screenshot belum terjadi, jadi tanggalnya tidak dipakai.');
    tanggal = null;
  }
  const jam =
    typeof raw.start_time === 'string' && POLA_JAM.test(raw.start_time) ? raw.start_time : null;

  const durasi = bulat(angka(raw.duration_seconds, 30, 86_400));
  const jarak = angka(raw.distance_km, 0.01, 500);
  let pace = bulat(angka(raw.pace_seconds_per_km, 60, 3600));

  if (pace === null && jarak !== null && durasi !== null && cocok?.distance_kind) {
    // Tidak tertulis: diturunkan dari durasi dan jarak, sama seperti isian manual.
    pace = Math.round(durasi / jarak);
  } else if (pace !== null && jarak !== null && durasi !== null) {
    const bergerak = pace * jarak;
    if (bergerak > durasi * TOLERANSI_PACE + 10) {
      peringatan.push(
        'Pace, jarak, dan durasi tidak cocok satu sama lain. Cek lagi angkanya sebelum menyimpan.',
      );
    } else if (bergerak < durasi * BATAS_JEDA) {
      peringatan.push(
        'Waktu bergerak dari pace kurang dari separuh durasi. Kalau memang banyak berhenti tidak apa-apa, kalau tidak cek lagi angkanya.',
      );
    }
  }

  const hrRata = bulat(angka(raw.avg_hr, 30, 250));
  const hrMaks = bulat(angka(raw.max_hr, 30, 250));
  if (hrRata !== null && hrMaks !== null && hrMaks < hrRata) {
    peringatan.push('HR maksimal lebih kecil dari HR rata-rata. Cek lagi angkanya.');
  }

  const total = bulat(angka(raw.total_kcal, 0, 20_000));
  const aktif = bulat(angka(raw.active_kcal, 0, 20_000));
  let kalori = total;
  if (kalori === null && aktif !== null) {
    // Layar cuma menampilkan kalori aktif: istirahat selama sesi ditambahkan
    // dari BMR, supaya yang tersimpan tetap angka total seperti biasanya.
    kalori =
      bmr !== null && durasi !== null ? aktif + Math.round((bmr / 1440) * (durasi / 60)) : aktif;
  }
  if (total !== null && aktif !== null && aktif > total) {
    peringatan.push('Kalori aktif lebih besar dari kalori total. Cek lagi angkanya.');
  }

  if (cocok === null && label !== null) {
    peringatan.push(`"${label}" tidak ada di daftar olahraga. Pilih jenisnya sendiri.`);
  }

  return {
    workout_library_id: cocok?.id ?? null,
    workout_name: cocok?.name ?? label,
    activity_label: label,
    distance_kind: cocok?.distance_kind ?? null,
    measure: cocok?.measure ?? null,
    logged_at: tanggal,
    started_at: tanggal !== null && jam !== null ? `${tanggal}T${jam}:00+07:00` : null,
    duration_seconds: durasi,
    distance_km: jarak === null ? null : Math.round(jarak * 100) / 100,
    pace_seconds_per_km: pace,
    avg_hr: hrRata,
    max_hr: hrMaks,
    avg_cadence: bulat(angka(raw.avg_cadence, 10, 300)),
    step_count: bulat(angka(raw.steps, 0, 200_000)),
    elevation_gain_m: bulat(angka(raw.elevation_gain_m, 0, 10_000)),
    training_effect: (() => {
      const te = angka(raw.training_effect, 0, 10);
      return te === null ? null : Math.round(te * 10) / 10;
    })(),
    calories_total: kalori,
    warnings: peringatan,
  };
};
