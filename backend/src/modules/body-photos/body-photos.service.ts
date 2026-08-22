import { forUser } from '../../data/scoped.js';
import { unitOfWork } from '../../data/unit-of-work.js';
import type { BodyPhotoRecord } from '../../types/directus-schema.js';
import { dailyKey, todayInJakarta } from '../../utils/daily-key.js';
import { removeFileSafely, uploadWebP } from '../../utils/directus-files.js';
import { analyzeImages, BODY_PROMPT } from '../../utils/groq.js';
import { type DateRangeDto, dateRangeFilter } from '../../utils/query.js';
import { convertToWebP, toAnalysisBuffer } from '../../utils/sharp.js';
import { recordActivitySafely } from '../streaks/streaks.service.js';
import type { CreateBodyPhotoDto } from './body-photos.validation.js';

/**
 * Mencatat foto badan tampak depan dan samping.
 *
 * Operasi paling rumit di seluruh backend: DUA file diunggah ke storage, AI
 * dipanggil dengan keduanya, lalu satu record dibuat. Ada empat titik yang
 * bisa gagal setelah file pertama terunggah.
 *
 * Seluruhnya dibungkus unitOfWork dan setiap file didaftarkan ke onRollback
 * segera setelah upload-nya berhasil. Kalau AI gagal atau pembuatan record
 * ditolak, kedua file ikut dihapus — tidak ada yang tertinggal di storage.
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

export const getToday = async (userId: string): Promise<BodyPhotoRecord | null> =>
  forUser(userId).findOne('body_photos', {
    filter: { logged_at: { _eq: todayInJakarta() } },
  });

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
 * adalah record itu hilang — file yang gagal dihapus dicatat di log untuk
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
