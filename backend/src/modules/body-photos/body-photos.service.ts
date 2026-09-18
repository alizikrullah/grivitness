import type { BodyDirection } from '../../constants/enums.js';
import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { BodyComparisonRecord, BodyPhotoRecord } from '../../types/directus-schema.js';
import { AppError } from '../../utils/api-error.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { downloadFile, removeFileSafely, uploadWebP } from '../../utils/directus-files.js';
import { analyzeImages, BODY_PROMPT, bodyComparePrompt } from '../../utils/groq.js';
import { logger } from '../../utils/logger.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { convertToWebP, sideBySide, toAnalysisBuffer } from '../../utils/sharp.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { ComparePhotosDto, CreateBodyPhotoDto } from './body-photos.validation.js';

/**
 * Mencatat foto badan tampak depan dan samping.
 *
 * Operasi paling rumit di seluruh backend: DUA file diunggah ke storage, AI
 * dipanggil dengan keduanya, lalu satu record dibuat. Ada empat titik yang
 * bisa gagal setelah file pertama terunggah.
 *
 * Seluruhnya dibungkus unitOfWork dan setiap file didaftarkan ke onRollback
 * segera setelah upload-nya berhasil. Kalau AI gagal atau pembuatan record
 * ditolak, kedua file ikut dihapus, tidak ada yang tertinggal di storage.
 */
export const create = async (
  userId: string,
  frontPhoto: Buffer,
  sidePhoto: Buffer,
  data: CreateBodyPhotoDto,
): Promise<BodyPhotoRecord> => {
  const loggedAt = data.logged_at ?? todayInJakarta();

  // Konversi dua gambar sekaligus. Sharp melepas event loop saat bekerja,
  // jadi keduanya benar-benar berjalan berdampingan.
  const [front, side] = await Promise.all([convertToWebP(frontPhoto), convertToWebP(sidePhoto)]);

  const log = await unitOfWork(async (tx) => {
    const frontFile = await uploadWebP(
      front.buffer,
      `body-front-${Date.now()}.webp`,
      'Foto badan depan',
    );
    tx.onRollback(() => removeFileSafely(frontFile.id), `foto depan ${frontFile.id}`);

    const sideFile = await uploadWebP(
      side.buffer,
      `body-side-${Date.now()}.webp`,
      'Foto badan samping',
    );
    tx.onRollback(() => removeFileSafely(sideFile.id), `foto samping ${sideFile.id}`);

    // Kedua foto dikirim dalam satu request supaya model bisa membandingkan
    // tampak depan dan samping, bukan menilainya terpisah.
    const analisa = await analyzeImages(
      await Promise.all([toAnalysisBuffer(front.buffer), toAnalysisBuffer(side.buffer)]),
      BODY_PROMPT,
    );

    return forUser(userId, tx).create('body_photos', {
      front_photo_url: frontFile.url,
      side_photo_url: sideFile.url,
      front_directus_file_id: frontFile.id,
      side_directus_file_id: sideFile.id,
      ai_analysis: analisa,
      logged_at: loggedAt,
      user_date_key: dailyKey(userId, loggedAt),
    });
  });

  await recordActivitySafely(userId);

  return log;
};

export const getByDate = async (userId: string, date: string): Promise<BodyPhotoRecord | null> =>
  forUser(userId).findOne('body_photos', {
    filter: { logged_at: { _eq: date } },
  });

export const getToday = async (userId: string): Promise<BodyPhotoRecord | null> =>
  getByDate(userId, todayInJakarta());

export const getRange = async (userId: string, range: DateRangeDto): Promise<BodyPhotoRecord[]> =>
  forUser(userId).list('body_photos', {
    filter: dateRangeFilter(range),
    sort: ['logged_at'],
    limit: -1,
  });

/**
 * Menghapus catatan foto badan beserta kedua filenya.
 *
 * File dihapus dari Directus lebih dulu, baru record-nya, sesuai CLAUDE.md
 * section 5. Dipakai versi "safely" karena hasil akhir yang diinginkan user
 * adalah record itu hilang, file yang gagal dihapus dicatat di log untuk
 * dibersihkan manual, bukan menggagalkan permintaannya.
 */
export const remove = async (userId: string, logId: string): Promise<void> => {
  const repo = forUser(userId);

  const log = await repo.findById('body_photos', logId);

  await Promise.all(
    [log.front_directus_file_id, log.side_directus_file_id]
      .filter((id): id is string => id !== null)
      .map((id) => removeFileSafely(id)),
  );

  await repo.remove('body_photos', logId);
};

// ============================================================
// PERBANDINGAN DUA TANGGAL
// ============================================================

/**
 * Satu sisi perbandingan: foto hari itu (kalau ada) dan lingkar pinggangnya
 * (kalau diukur). Pinggang dari pita adalah angka kerasnya; fotonya untuk
 * dilihat sendiri; pendapat AI di bawahnya cuma suara kedua.
 */
export interface SisiPerbandingan {
  date: string;
  photo: BodyPhotoRecord | null;
  waist_cm: string | null;
}

export interface BodyComparisonView {
  from: SisiPerbandingan;
  to: SisiPerbandingan;
  /** Pendapat AI yang tersimpan untuk pasangan tanggal ini, kalau pernah diminta. */
  comparison: BodyComparisonRecord | null;
}

const sisi = async (userId: string, date: string): Promise<SisiPerbandingan> => {
  const repo = forUser(userId);

  const [photo, ukuran] = await Promise.all([
    repo.findOne('body_photos', { filter: { logged_at: { _eq: date } } }),
    repo.findOne('body_measurements', { filter: { logged_at: { _eq: date } } }),
  ]);

  return { date, photo, waist_cm: ukuran?.waist_cm ?? null };
};

const pairKey = (userId: string, from: string, to: string): string => `${userId}:${from}:${to}`;

/**
 * Tampilan perbandingan: dua tanggal berdampingan. Deterministik, tanpa AI.
 * Inilah fungsi asli progress photo: user melihat sendiri.
 */
export const getComparison = async (
  userId: string,
  data: ComparePhotosDto,
): Promise<BodyComparisonView> => {
  const [from, to, comparison] = await Promise.all([
    sisi(userId, data.from),
    sisi(userId, data.to),
    forUser(userId).findOne('body_comparisons', {
      filter: { pair_key: { _eq: pairKey(userId, data.from, data.to) } },
    }),
  ]);

  return { from, to, comparison };
};

/** Semua pendapat yang pernah diminta, yang terbaru dulu. Riwayat untuk dibaca urut. */
export const listComparisons = async (userId: string): Promise<BodyComparisonRecord[]> =>
  forUser(userId).list('body_comparisons', { sort: ['-to_date', '-created_at'], limit: -1 });

const ARAH: Record<string, BodyDirection> = {
  leaner: 'LEANER',
  same: 'SAME',
  fuller: 'FULLER',
  unclear: 'UNCLEAR',
};

/**
 * Meminta kesan AI atas dua tanggal, lalu menyimpannya.
 *
 * HANYA dipanggil saat user menekan tombolnya, bukan tiap layar dibuka: empat
 * gambar per panggilan, dan ini fitur 2-4 minggu sekali. Satu pendapat per
 * pasangan tanggal; meminta ulang menimpa yang lama.
 *
 * Hasilnya disimpan sebagai TEKS dan label arah. Tidak ada persen, tidak ada
 * angka, dan tidak pernah masuk ke hitungan mana pun. Yang disimpan bersamanya
 * lingkar pinggang kedua tanggal saat itu, supaya riwayat pendapatnya bisa
 * dibaca berdampingan dengan angka kerasnya nanti.
 */
export const compare = async (
  userId: string,
  data: ComparePhotosDto,
): Promise<BodyComparisonRecord> => {
  const tampilan = await getComparison(userId, data);

  const fotoDari = tampilan.from.photo;
  const fotoKe = tampilan.to.photo;

  if (!fotoDari || !fotoKe) {
    throw AppError.badRequest(
      `Kedua tanggal harus punya foto badan. ${!fotoDari ? data.from : data.to} belum ada fotonya.`,
    );
  }

  const berkas = {
    depanDari: fotoDari.front_directus_file_id,
    sampingDari: fotoDari.side_directus_file_id,
    depanKe: fotoKe.front_directus_file_id,
    sampingKe: fotoKe.side_directus_file_id,
  };

  if (!berkas.depanDari || !berkas.sampingDari || !berkas.depanKe || !berkas.sampingKe) {
    throw AppError.badRequest('Sebagian foto sudah tidak ada di storage, tidak bisa dibandingkan');
  }

  // Empat berkas diunduh bersamaan, lalu digabung jadi DUA gambar berdampingan:
  // depan (sebelum | sesudah) dan samping (sebelum | sesudah). Model vision
  // Groq membatasi tiga gambar per permintaan, jadi empat tidak bisa dikirim
  // apa adanya, dan berdampingan memang cara membandingkan yang benar.
  const [depanDari, sampingDari, depanKe, sampingKe] = await Promise.all([
    downloadFile(berkas.depanDari),
    downloadFile(berkas.sampingDari),
    downloadFile(berkas.depanKe),
    downloadFile(berkas.sampingKe),
  ]);

  const [depan, samping] = await Promise.all([
    sideBySide(depanDari, depanKe),
    sideBySide(sampingDari, sampingKe),
  ]);

  const mentah = await analyzeImages([depan, samping], bodyComparePrompt(data.from, data.to));

  const arah =
    typeof mentah.direction === 'string' ? ARAH[mentah.direction.toLowerCase()] : undefined;
  const pendapat = typeof mentah.opinion === 'string' ? mentah.opinion.trim() : '';

  if (!arah || pendapat === '') {
    logger.warn({ mentah }, 'Balasan perbandingan foto badan tidak sesuai format');
    throw AppError.upstream('Hasil perbandingan AI tidak bisa dibaca. Coba lagi.');
  }

  const repo = forUser(userId);
  const kunci = pairKey(userId, data.from, data.to);

  const isi = {
    from_date: data.from,
    to_date: data.to,
    direction: arah,
    opinion: pendapat,
    waist_from_cm: tampilan.from.waist_cm,
    waist_to_cm: tampilan.to.waist_cm,
    ai_raw: mentah,
  };

  const lama = tampilan.comparison;

  return lama
    ? repo.update('body_comparisons', lama.id, isi)
    : repo.create('body_comparisons', { ...isi, pair_key: kunci });
};
