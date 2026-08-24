import { FlaskIcon, HourglassIcon } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { ProgressBar, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import type { ObservedTdee } from '@/types';
import { thousands } from '@/utils/format';

/**
 * Menjelaskan apakah TDEE yang dipakai masih tebakan rumus atau sudah diukur
 * dari data user sendiri.
 *
 * Ditampilkan terang-terangan, termasuk saat datanya belum cukup. Aplikasi
 * sejenis menampilkan satu angka TDEE tanpa pernah menyebut bahwa itu hasil
 * rumus dari 498 orang di tahun 1990 — user jadi mempercayainya seolah hasil
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
    <View style={[styles.box, terukur && styles.boxOn]}>
      <View style={styles.head}>
        {terukur ? (
          <FlaskIcon size={16} color={colors.success} weight="duotone" />
        ) : (
          <HourglassIcon size={16} color={colors.textTertiary} weight="duotone" />
        )}

        <Text variant="label" tone={terukur ? 'success' : 'secondary'} style={styles.headText}>
          {terukur ? 'Diukur dari datamu' : 'Masih pakai perkiraan rumus'}
        </Text>
      </View>

      {terukur ? (
        <>
          <Text variant="caption" tone="secondary">
            Catatanmu menunjukkan pengeluaran {thousands(observed.measured!)} kkal, bukan{' '}
            {thousands(observed.estimated)} kkal seperti perkiraan awal. Dihitung dari{' '}
            {observed.logged_days} hari catatan makan dan {observed.weigh_ins} penimbangan.
          </Text>

          {/*
            Bobotnya ditampilkan karena pengukurannya bergantung pada ketelitian
            mencatat makan. Angka ini bergeser makin dekat ke hasil pengukuran
            seiring datamu bertambah panjang dan rapat — bukan melompat penuh,
            supaya jatah kalori tidak berayun tiap minggu mengikuti berat air.
          */}
          <View style={styles.bar}>
            <ProgressBar progress={observed.confidence} color={colors.success} />
            <Text variant="caption" tone="tertiary">
              Bobot pengukuran {Math.round(observed.confidence * 100)}%. Makin lengkap catatanmu,
              makin besar bobotnya.
            </Text>
          </View>
        </>
      ) : (
        <Text variant="caption" tone="tertiary">
          {observed.reason ? ALASAN[observed.reason] : ''} Sudah ada {observed.logged_days} hari
          catatan makan dan {observed.weigh_ins} penimbangan dari {observed.days} hari terakhir.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  boxOn: { borderColor: colors.success },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headText: { flex: 1 },
  bar: { gap: spacing.xs, marginTop: spacing.xs },
});
