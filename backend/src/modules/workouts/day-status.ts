import type { WorkoutDayStatus } from '../../constants/enums.js';
import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import { AppError } from '../../utils/api-error.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { type PeriodeSakit, ubahTandaSakit } from '../sick-periods/sick-days.js';
import * as sickService from '../sick-periods/sick-periods.service.js';
import type { WorkoutDayStatusDto } from './workouts.validation.js';

/**
 * Kondisi tubuh satu hari: rest day, lagi sakit, atau normal.
 *
 * Pilihannya di layar Mood ("Kondisi tubuh"). Tempatnya sempat berpindah dua
 * kali: centang di halaman Catat terlihat janggal, dan di layar olahraga
 * gampang terlewat karena olahraga tidak wajib tiap hari. Mood termasuk enam
 * catatan harian. Endpoint-nya tetap di /workouts: yang pindah cuma tampilan.
 *
 * Dua-duanya cuma TANDA untuk chat dan overview. Tidak ada hitungan yang
 * berubah (CLAUDE.md section 9).
 */
export interface StatusHari {
  day_status: WorkoutDayStatus | null;
  /** Rentang sakit yang memuat tanggal ini, supaya layar bisa menyebut sejak kapan. */
  sick: PeriodeSakit | null;
}

const hariIstirahat = (userId: string, date: string) =>
  forUser(userId).findOne('rest_days', { filter: { logged_at: { _eq: date } }, fields: ['id'] });

/** Status satu tanggal, dibaca bersama sesi olahraganya. */
export const bacaStatusHari = async (userId: string, date: string): Promise<StatusHari> => {
  const [istirahat, sakit] = await Promise.all([
    hariIstirahat(userId, date),
    forUser(userId).findOne('sick_periods', {
      filter: {
        start_date: { _lte: date },
        _or: [{ end_date: { _null: true } }, { end_date: { _gte: date } }],
      },
    }),
  ]);

  return {
    // Satu hari cuma punya satu status; kalau dua-duanya ada (endpoint lama
    // /api/sick-periods/day tidak menghapus rest day), sakit yang menang.
    day_status: sakit ? 'SICK' : istirahat ? 'REST' : null,
    sick: sakit ? { id: sakit.id, start_date: sakit.start_date, end_date: sakit.end_date } : null,
  };
};

/**
 * Memasang status satu tanggal. Status lain di tanggal itu ikut dicabut.
 *
 * SICK memakai aturan rentang yang sama dengan centang lama (ubahTandaSakit):
 * dipilih di hari sesudah semua rentang berarti mulai sakit dan berlaku terus;
 * memilih status lain di dalam rentang terbuka berarti sembuh mulai hari itu.
 * REST cuma hari itu.
 *
 * Bisa menulis ke dua collection (sick_periods dan rest_days), jadi dibungkus
 * unitOfWork.
 */
export const setDayStatus = async (
  userId: string,
  data: WorkoutDayStatusDto,
): Promise<StatusHari> => {
  const hariIni = todayInJakarta();
  if (data.date > hariIni) {
    throw AppError.badRequest('Status hari tidak bisa dipasang di tanggal yang belum terjadi');
  }

  const [periode, istirahat] = await Promise.all([
    sickService.listAll(userId),
    hariIstirahat(userId, data.date),
  ]);

  const operasi = ubahTandaSakit(periode, data.date, data.status === 'SICK', hariIni);
  const tambahIstirahat = data.status === 'REST' && istirahat === null;
  const cabutIstirahat = data.status !== 'REST' ? istirahat : null;

  if (operasi.length > 0 || tambahIstirahat || cabutIstirahat) {
    await unitOfWork(async (tx) => {
      const repo = forUser(userId, tx);
      await sickService.terapkanOperasi(repo, operasi);

      if (tambahIstirahat) {
        await repo.create('rest_days', {
          logged_at: data.date,
          user_date_key: dailyKey(userId, data.date),
        });
      }
      if (cabutIstirahat) await repo.remove('rest_days', cabutIstirahat.id);
    });
  }

  return bacaStatusHari(userId, data.date);
};
