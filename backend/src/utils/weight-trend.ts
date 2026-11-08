export interface WeightPoint {
  /** YYYY-MM-DD */
  date: string;
  kg: number;
}

/**
 * Laju perubahan berat lewat regresi linear, dalam kg per hari.
 *
 * Dipilih daripada sekadar mengurangi penimbangan terakhir dengan yang pertama.
 * Berat badan berayun satu sampai dua kilo hanya karena air, garam, dan isi
 * perut; dua titik ujung membuat seluruh kesimpulan bergantung pada kebetulan
 * kondisi dua hari itu. Regresi memakai SEMUA penimbangan, jadi ayunannya
 * saling meredam. Dipakai tren berat di overview beranda.
 *
 * Cuma pantauan. Tidak ada angka energi yang diturunkan dari sini lagi: TDEE
 * terukur dari timbangan dicabut 7 Nov 2026, lihat data/energy-profile.ts.
 */
export const lajuPerHari = (weights: WeightPoint[]): number | null => {
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
