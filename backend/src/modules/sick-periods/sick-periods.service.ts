import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { SickPeriodRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { todayInJakarta } from '../../utils/daily-key.js';
import type { DateRangeDto } from '../../utils/query.js';
import { type PeriodeSakit, periodePada, ubahTandaSakit } from './sick-days.js';
import type { SetSickDayDto } from './sick-periods.validation.js';

/** Semua rentang sakit user, urut dari yang paling lama. Jumlahnya kecil. */
export const listAll = async (userId: string): Promise<PeriodeSakit[]> =>
  await forUser(userId).list('sick_periods', {
    fields: ['id', 'start_date', 'end_date'],
    sort: ['start_date'],
    limit: -1,
  });

/** Rentang yang bersinggungan dengan [from, to]. */
export const getRange = async (userId: string, range: DateRangeDto): Promise<SickPeriodRecord[]> =>
  forUser(userId).list('sick_periods', {
    filter: {
      start_date: { _lte: range.to },
      _or: [{ end_date: { _null: true } }, { end_date: { _gte: range.from } }],
    },
    sort: ['start_date'],
    limit: -1,
  });

/**
 * Menyalakan atau mematikan tanda sakit satu tanggal.
 *
 * Bisa menulis dua baris sekaligus (menggabung atau membelah rentang), jadi
 * dibungkus unitOfWork: kalau langkah kedua gagal, langkah pertama dibatalkan
 * dan rentangnya tidak tertinggal setengah jadi.
 */
export const setDay = async (
  userId: string,
  data: SetSickDayDto,
): Promise<{ sick: PeriodeSakit | null }> => {
  const hariIni = todayInJakarta();
  if (data.date > hariIni) {
    throw AppError.badRequest('Tanda sakit tidak bisa dipasang di tanggal yang belum terjadi');
  }

  const periode = await listAll(userId);
  const operasi = ubahTandaSakit(periode, data.date, data.sick, hariIni);

  if (operasi.length > 0) {
    await unitOfWork(async (tx) => {
      const repo = forUser(userId, tx);
      for (const op of operasi) {
        if (op.jenis === 'create') {
          await repo.create('sick_periods', { start_date: op.start_date, end_date: op.end_date });
        } else if (op.jenis === 'update') {
          const { id, jenis: _jenis, ...perubahan } = op;
          await repo.update('sick_periods', id, perubahan);
        } else {
          await repo.remove('sick_periods', op.id);
        }
      }
    });
  }

  return { sick: periodePada(operasi.length > 0 ? await listAll(userId) : periode, data.date) };
};
