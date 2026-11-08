import { baselineTDEE } from '../utils/calories.js';
import { loadUserMetrics, type UserMetrics } from './user-metrics.js';

/**
 * Metrik tubuh user ditambah TDEE hari biasa dari rumus.
 *
 * Dulu lapisan ini juga mengukur TDEE dari catatan makan dan timbangan
 * (observeTDEE), lalu memakainya untuk dua hal: menggeser jatah, dan
 * mengalikan kalori keluar ("koreksi timbangan"). Keduanya dicabut 7 Nov 2026
 * atas keputusan pemilik. Datanya 26 Okt sampai 6 Nov: rumus keluar sekitar
 * 3.200, hasil ukur sekitar 1.800, jadi kalori keluar 4 Nov tampil 1.965 dan
 * jatah tertahan di 1.500, sementara berat bisa macet berminggu-minggu karena
 * air lalu turun drastis. Angka yang mengikuti timbangan mencekik tepat saat
 * macet, dan tidak bisa membedakan lemak yang turun dari otot yang naik.
 *
 * Sekarang semua angka energi dari rumus. Timbangan dibaca user sendiri.
 */
export interface EnergyProfile extends UserMetrics {
  /**
   * TDEE hari biasa (tidur 8 jam, tanpa olahraga) dari rumus, dasar jatah.
   * Null selama profil belum diisi atau user belum pernah menimbang.
   */
  baselineTdee: number | null;
}

export const loadEnergyProfile = async (userId: string): Promise<EnergyProfile> => {
  const metrics = await loadUserMetrics(userId);

  return {
    ...metrics,
    baselineTdee: metrics.bmr === null ? null : baselineTDEE(metrics.bmr, metrics.activityLevel),
  };
};
