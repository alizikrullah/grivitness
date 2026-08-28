import { FlaskIcon, HourglassIcon } from '@phosphor-icons/react';

import { ProgressBar } from '@/components/ui';
import { colors } from '@/constants/colors';
import type { ObservedTdee } from '@/types';
import { thousands } from '@/utils/format';
import './ObservedTdeeNote.css';

/**
 * Menjelaskan apakah TDEE yang dipakai masih tebakan rumus atau sudah diukur
 * dari data user sendiri.
 *
 * Ditampilkan terang-terangan, termasuk saat datanya belum cukup. Aplikasi
 * sejenis menampilkan satu angka TDEE tanpa pernah menyebut bahwa itu hasil
 * rumus dari 498 orang di tahun 1990, user jadi mempercayainya seolah hasil
 * pengukuran, lalu bingung sendiri saat programnya tidak bekerja.
 */

const ALASAN: Record<NonNullable<ObservedTdee['reason']>, string> = {
  BELUM_CUKUP_HARI: 'Butuh minimal 14 hari data.',
  BELUM_CUKUP_TIMBANGAN: 'Butuh minimal 6 penimbangan dalam 6 minggu terakhir.',
  RENTANG_TIMBANG_PENDEK:
    'Penimbanganmu masih terlalu berdekatan. Timbang berkala selama beberapa minggu.',
  CATATAN_MAKAN_KURANG: 'Catatan makanmu belum menutupi cukup banyak hari.',
  HASIL_TIDAK_WAJAR:
    'Hasilnya jauh di luar dugaan. Biasanya itu berarti ada catatan makan atau berat yang keliru.',
};

export const ObservedTdeeNote = ({ observed }: { observed: ObservedTdee }) => {
  const terukur = observed.measured !== null && observed.reason === null;

  return (
    <div className={'obs' + (terukur ? ' obs-on' : '')}>
      <div className="obs-head">
        {terukur ? (
          <FlaskIcon size={16} color={colors.success} weight="duotone" />
        ) : (
          <HourglassIcon size={16} color={colors.textTertiary} weight="duotone" />
        )}

        <span className={'t-label ' + (terukur ? 'c-success' : 'c-secondary')}>
          {terukur ? 'Diukur dari datamu' : 'Masih pakai perkiraan rumus'}
        </span>
      </div>

      {terukur && observed.measured !== null ? (
        <>
          <p className="t-caption c-secondary">
            Catatanmu menunjukkan pengeluaran {thousands(observed.measured)} kkal, bukan{' '}
            {thousands(observed.estimated)} kkal seperti perkiraan awal. Dihitung dari{' '}
            {observed.logged_days} hari catatan makan dan {observed.weigh_ins} penimbangan.
          </p>

          {/*
            Bobotnya ditampilkan karena pengukurannya bergantung pada ketelitian
            mencatat makan. Angka ini bergeser makin dekat ke hasil pengukuran
            seiring datanya bertambah panjang dan rapat, bukan melompat penuh,
            supaya jatah kalori tidak berayun tiap minggu mengikuti berat air.
          */}
          <div className="obs-bar">
            <ProgressBar progress={observed.confidence} color={colors.success} />
            <span className="t-caption c-tertiary">
              Bobot pengukuran {Math.round(observed.confidence * 100)}%. Makin lengkap catatanmu,
              makin besar bobotnya.
            </span>
          </div>
        </>
      ) : (
        <p className="t-caption c-tertiary">
          {observed.reason ? ALASAN[observed.reason] : ''} Sudah ada {observed.logged_days} hari
          catatan makan dan {observed.weigh_ins} penimbangan dari {observed.days} hari terakhir.
        </p>
      )}
    </div>
  );
};
