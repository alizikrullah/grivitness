import { forUser } from '../../data/scoped.js';
import { loadUserMetrics } from '../../data/user-metrics.js';
import type { DeviceEnergyLogRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateDeviceEnergyDto } from './device-energy.validation.js';

/**
 * Kalori keluar harian menurut smartwatch user.
 *
 * User memasukkan SALAH SATU dari dua angka, tergantung apa yang ditampilkan
 * perangkatnya: kalori total, atau kalori aktif saja. Untuk yang aktif, BMR
 * ditambahkan di sini karena kalori aktif memang mengukur pengeluaran di ATAS
 * istirahat, sehingga metabolisme basalnya justru bagian yang belum terhitung.
 *
 * Angka ini MENGGANTIKAN hitungan TDEE hari itu, tidak pernah ditambahkan ke
 * atasnya. Alasannya struktural: jam tangan mengukur seluruh hari, termasuk
 * jalan kaki dan kegiatan di luar olahraga yang sudah dihitung metode faktorial
 * dari step_logs dan activity_level. Menjumlahkan keduanya berarti menghitung
 * jam yang sama dua kali, persis kekeliruan yang membuat rumus lama dibuang.
 *
 * Yang boleh ditambahkan di atasnya hanya olahraga yang TIDAK dilihat jam
 * tangan, misalnya berenang atau sesi yang jamnya kebetulan tidak dipakai.
 * Penandanya ada di workout_logs.tracked_by_device.
 */

/**
 * Menyimpan angka hari itu, menimpa kalau sudah ada.
 *
 * Sengaja upsert dan bukan create biasa. Mengoreksi angka yang salah ambil
 * adalah hal yang wajar terjadi, dan memaksa user menghapus dulu baru mencatat
 * ulang cuma menambah langkah tanpa menambah keamanan apa pun.
 */
export const save = async (
  userId: string,
  data: CreateDeviceEnergyDto,
): Promise<DeviceEnergyLogRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();

  const repo = forUser(userId);

  const [metrics, adaSebelumnya] = await Promise.all([
    loadUserMetrics(userId),
    repo.findOne('device_energy_logs', { filter: { logged_at: { _eq: loggedAt } } }),
  ]);

  /**
   * Kalori aktif diubah jadi total dengan menambahkan BMR.
   *
   * Banyak jam tangan HANYA menampilkan kalori aktif, jadi memaksa user
   * menyediakan angka total berarti fiturnya tidak bisa dipakai sama sekali di
   * perangkat seperti itu. Yang dijumlahkan di sini bukan dua pengukuran yang
   * tumpang tindih: kalori aktif memang mengukur pengeluaran DI ATAS istirahat,
   * jadi BMR adalah bagian yang justru belum terhitung.
   *
   * BMR-nya taksiran Mifflin-St Jeor, bukan pengukuran. Karena itu ia disimpan
   * bersama angka aktifnya, supaya total yang tersimpan bisa ditelusuri kembali
   * dan tidak jadi angka jadi tanpa asal-usul.
   */
  if (data.active_kcal !== undefined && metrics.bmr === null) {
    throw AppError.badRequest(
      'Kalori aktif perlu ditambah metabolisme istirahatmu, dan itu belum bisa dihitung. Lengkapi profil dan catat berat badanmu dulu, atau masukkan angka kalori total kalau jam tanganmu punya.',
    );
  }

  /**
   * Penjaga terpenting untuk angka TOTAL.
   *
   * Jam tangan menampilkan dua angka bersebelahan, dan yang aktif tidak memuat
   * metabolisme istirahat. Kalau yang itu tersalin ke kolom total, kalori
   * keluar hari itu terbaca jauh lebih kecil daripada kenyataan dan defisit
   * user terlihat nyaris tidak ada.
   *
   * Tubuh tidak mungkin membakar kurang dari metabolisme istirahatnya dalam
   * sehari, jadi angka di bawah BMR adalah bukti pengambilannya salah. Ditolak
   * di sini, bukan disimpan lalu diam-diam merusak seluruh rekap.
   */
  if (data.total_kcal !== undefined && metrics.bmr !== null && data.total_kcal < metrics.bmr) {
    throw AppError.badRequest(
      `${data.total_kcal} kkal ada di bawah metabolisme istirahatmu yang sekitar ${Math.round(
        metrics.bmr,
      )} kkal. Kalau itu angka "kalori aktif" dari jam tanganmu, masukkan lewat kolom kalori aktif supaya metabolisme istirahatnya ditambahkan.`,
    );
  }

  const bmr = metrics.bmr === null ? null : Math.round(metrics.bmr);

  /**
   * Zod sudah memastikan tepat satu dari keduanya terisi, tapi diperiksa ulang
   * di sini daripada dipaksa dengan `?? 0`. Nol yang menyelinap masuk akan
   * tersimpan sebagai "hari ini tidak membakar apa pun" tanpa satu pun error,
   * dan itu jenis kesalahan yang baru ketahuan setelah rekapnya sudah rusak.
   */
  const aktif = data.active_kcal;
  const keterangan = { source: data.source ?? null, notes: data.notes ?? null };

  let isi;

  if (aktif === undefined) {
    if (data.total_kcal === undefined) {
      throw AppError.badRequest('Isi salah satu: kalori total atau kalori aktif');
    }

    isi = {
      total_kcal: data.total_kcal,
      // Dikosongkan supaya baris yang tadinya hasil turunan tidak meninggalkan
      // jejak lama saat user menimpanya dengan angka total.
      active_kcal: null,
      bmr_kcal: null,
      ...keterangan,
    };
  } else {
    if (bmr === null) {
      throw AppError.badRequest('Metabolisme istirahatmu belum bisa dihitung');
    }

    isi = {
      total_kcal: bmr + aktif,
      active_kcal: aktif,
      bmr_kcal: bmr,
      ...keterangan,
    };
  }

  const log = adaSebelumnya
    ? await repo.update('device_energy_logs', adaSebelumnya.id, isi)
    : await repo.create('device_energy_logs', {
        ...isi,
        logged_at: loggedAt,
        user_date_key: dailyKey(userId, loggedAt),
      });

  await recordActivitySafely(userId);

  return log;
};

export const getByDate = async (
  userId: string,
  date: string,
): Promise<DeviceEnergyLogRecord | null> =>
  forUser(userId).findOne('device_energy_logs', {
    filter: { logged_at: { _eq: date } },
  });

export const getToday = async (userId: string): Promise<DeviceEnergyLogRecord | null> =>
  getByDate(userId, todayInJakarta());

export const getRange = async (
  userId: string,
  range: DateRangeDto,
): Promise<DeviceEnergyLogRecord[]> =>
  forUser(userId).list('device_energy_logs', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

export const remove = async (userId: string, logId: string): Promise<void> => {
  await forUser(userId).remove('device_energy_logs', logId);
};
