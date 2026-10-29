/**
 * Aturan tanda sakit, murni tanpa Directus, diuji di sick-days.test.ts.
 *
 * Disimpan sebagai RENTANG (sick_periods), bukan satu baris per hari: sakit
 * sebulan cukup ditandai dua kali, di hari pertama dan di hari sembuh.
 * end_date kosong berarti masih sakit sampai hari ini.
 *
 * Tanda ini cuma KONTEKS untuk chat dan overview. Tidak ada hitungan yang
 * mengeluarkan hari sakit: kalau sakitnya sebulan, kalori terbakar yang turun
 * memang kenyataan, dan jatah yang ikut turun itu benar.
 */

export interface PeriodeSakit {
  id: string;
  start_date: string;
  end_date: string | null;
}

export type OperasiSakit =
  | { jenis: 'create'; start_date: string; end_date: string | null }
  | { jenis: 'update'; id: string; start_date?: string; end_date?: string | null }
  | { jenis: 'delete'; id: string };

export const geserTanggal = (tanggal: string, hari: number): string =>
  new Date(new Date(`${tanggal}T00:00:00Z`).getTime() + hari * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** Rentang yang memuat tanggal itu. Rentang terbuka berlaku sampai kapan pun. */
export const periodePada = (periode: PeriodeSakit[], tanggal: string): PeriodeSakit | null =>
  periode.find((p) => p.start_date <= tanggal && (p.end_date === null || p.end_date >= tanggal)) ??
  null;

/** Tanggal sakit di dalam [from, to]. Rentang terbuka dianggap berlanjut sampai `today`. */
export const tanggalSakit = (
  periode: PeriodeSakit[],
  from: string,
  to: string,
  today: string,
): Set<string> => {
  const hasil = new Set<string>();

  for (const p of periode) {
    const awal = p.start_date > from ? p.start_date : from;
    const ujung = p.end_date ?? today;
    const akhir = ujung < to ? ujung : to;
    for (let t = awal; t <= akhir; t = geserTanggal(t, 1)) hasil.add(t);
  }

  return hasil;
};

/**
 * Menyalakan atau mematikan tanda sakit di satu tanggal, diterjemahkan jadi
 * operasi atas rentang. Rentang tidak pernah saling tumpang tindih.
 *
 * Menyalakan:
 *   - di hari sesudah semua rentang: MULAI SAKIT, rentang terbuka yang
 *     berlaku terus sampai ditandai sembuh;
 *   - di depan atau di sela rentang lain: cukup hari itu saja, supaya tidak
 *     ada hari lain yang ikut tertandai diam-diam;
 *   - rentang yang bersebelahan selalu digabung.
 *
 * Mematikan:
 *   - di rentang terbuka (masih sakit), atau di hari terakhir rentang:
 *     SEMBUH mulai tanggal itu, rentangnya berakhir sehari sebelumnya;
 *   - di hari pertama: rentangnya mulai sehari sesudahnya;
 *   - di tengah rentang yang sudah ditutup: dibelah, cuma hari itu yang dicabut.
 */
export const ubahTandaSakit = (
  periode: PeriodeSakit[],
  tanggal: string,
  sakit: boolean,
  today: string,
): OperasiSakit[] => {
  const memuat = periodePada(periode, tanggal);

  if (sakit) {
    if (memuat) return [];

    const sebelum = periode.find(
      (p) => p.end_date !== null && geserTanggal(p.end_date, 1) === tanggal,
    );
    const sesudah = periode.find((p) => p.start_date === geserTanggal(tanggal, 1));
    const adaYangLebihBaru = periode.some((p) => p.start_date > tanggal);
    const ujung = adaYangLebihBaru ? tanggal : null;

    if (sebelum && sesudah) {
      return [
        { jenis: 'update', id: sebelum.id, end_date: sesudah.end_date },
        { jenis: 'delete', id: sesudah.id },
      ];
    }
    if (sebelum) return [{ jenis: 'update', id: sebelum.id, end_date: ujung }];
    if (sesudah) return [{ jenis: 'update', id: sesudah.id, start_date: tanggal }];
    return [{ jenis: 'create', start_date: tanggal, end_date: ujung }];
  }

  if (!memuat) return [];

  if (memuat.start_date === tanggal) {
    const besok = geserTanggal(tanggal, 1);
    const habis = memuat.end_date === null ? besok > today : besok > memuat.end_date;
    return habis
      ? [{ jenis: 'delete', id: memuat.id }]
      : [{ jenis: 'update', id: memuat.id, start_date: besok }];
  }

  const kemarin = geserTanggal(tanggal, -1);

  if (memuat.end_date === null || memuat.end_date === tanggal) {
    return [{ jenis: 'update', id: memuat.id, end_date: kemarin }];
  }

  return [
    { jenis: 'update', id: memuat.id, end_date: kemarin },
    { jenis: 'create', start_date: geserTanggal(tanggal, 1), end_date: memuat.end_date },
  ];
};
