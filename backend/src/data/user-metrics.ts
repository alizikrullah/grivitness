import type { ActivityLevel, Gender } from '../constants/enums.js';
import { calculateAge, calculateBMR } from '../utils/calories.js';
import { toNumber } from '../utils/number.js';
import { forUser } from './scoped.js';

/**
 * Satu tempat untuk mengambil ukuran tubuh user yang dibutuhkan perhitungan energi.
 *
 * Sebelumnya tiap service mengambil berat badan terakhir sendiri-sendiri dengan
 * salinan fungsi yang sama. Begitu perhitungannya butuh tinggi badan dan jenis
 * kelamin juga — jarak per langkah sekarang diturunkan dari tinggi — salinan itu
 * harus ikut bertambah di setiap tempat, dan yang terlewat tidak akan ketahuan
 * sampai angkanya sudah salah di layar.
 */

/**
 * Nilai cadangan ketika user belum mengisi apa pun.
 *
 * Dipakai supaya pencatatan langkah tidak DITOLAK hanya karena profil belum
 * lengkap. Estimasinya jadi kasar, dan itu ditandai lewat `complete` supaya
 * pemanggil bisa memilih untuk tidak menampilkan angka turunannya sama sekali.
 */
const CADANGAN = { weightKg: 70, heightCm: 170, age: 30, gender: 'OTHER' as Gender };

export interface UserMetrics {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
  activityLevel: ActivityLevel;
  /** Null selama profil belum diisi atau user belum pernah menimbang. */
  bmr: number | null;
  /** True kalau semua angka di atas benar-benar berasal dari data user. */
  complete: boolean;
  hasWeight: boolean;
  hasProfile: boolean;
}

/**
 * Mengambil berat terakhir dan profil sekaligus, lalu menurunkan BMR.
 *
 * Dua query dijalankan bersamaan karena tidak saling bergantung — berurutan
 * berarti menumpuk dua kali latensi HTTP ke Directus tanpa alasan.
 */
export const loadUserMetrics = async (userId: string): Promise<UserMetrics> => {
  const repo = forUser(userId);

  const [weightLog, profile] = await Promise.all([
    repo.findOne('weight_logs', { sort: ['-logged_at'], fields: ['weight_kg'] }),
    repo.findOne('user_profiles'),
  ]);

  const weightKg = weightLog ? toNumber(weightLog.weight_kg) : null;

  const heightCm = profile ? toNumber(profile.height_cm) : CADANGAN.heightCm;
  const age = profile ? calculateAge(profile.birth_date) : CADANGAN.age;
  const gender = profile?.gender ?? CADANGAN.gender;
  const activityLevel = profile?.activity_level ?? 'SEDENTARY';

  return {
    weightKg: weightKg ?? CADANGAN.weightKg,
    heightCm,
    age,
    gender,
    activityLevel,
    bmr:
      weightKg === null || !profile
        ? null
        : calculateBMR({ weightKg, heightCm, age, gender }),
    complete: weightKg !== null && profile !== null,
    hasWeight: weightKg !== null,
    hasProfile: profile !== null,
  };
};
