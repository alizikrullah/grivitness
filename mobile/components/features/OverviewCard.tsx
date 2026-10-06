import {
  BarbellIcon,
  DropIcon,
  FishIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  NotePencilIcon,
  ScalesIcon,
  CubeIcon,
} from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GoalProgress } from '@/components/features/Metrics';
import { Card, IconCircle, ProgressBar, SectionHeader, Text } from '@/components/ui';
import { colors, macroColors, metricColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import type { DailyOverview, OverviewItem, OverviewKey } from '@/types';

/**
 * Ikon dan warna per metrik. Warnanya warna metrik itu di layar lain, dan
 * ikonnya selalu duduk di IconCircle gelap, sama seperti kartu metrik beranda.
 */
const METRIK: Record<OverviewKey, { color: string; icon: (color: string) => ReactNode }> = {
  calories: {
    color: metricColors.calories,
    icon: (c) => <ForkKnifeIcon size={18} color={c} weight="fill" />,
  },
  protein: {
    color: macroColors.protein,
    icon: (c) => <FishIcon size={18} color={c} weight="fill" />,
  },
  sleep: {
    color: metricColors.sleep,
    icon: (c) => <MoonStarsIcon size={18} color={c} weight="fill" />,
  },
  water: { color: metricColors.water, icon: (c) => <DropIcon size={18} color={c} weight="fill" /> },
  sugar: { color: macroColors.sugar, icon: (c) => <CubeIcon size={18} color={c} weight="fill" /> },
  workout: {
    color: metricColors.workout,
    icon: (c) => <BarbellIcon size={18} color={c} weight="fill" />,
  },
  weight: {
    color: metricColors.weight,
    icon: (c) => <ScalesIcon size={18} color={c} weight="fill" />,
  },
  food_log: {
    color: metricColors.calories,
    icon: (c) => <NotePencilIcon size={18} color={c} weight="fill" />,
  },
  steps: {
    color: metricColors.steps,
    icon: (c) => <FootprintsIcon size={18} color={c} weight="fill" />,
  },
};

/**
 * Satu hal yang perlu dibenahi, berbentuk seperti kartu metrik beranda:
 * permukaan gelap dengan garis tepi tipis, ikon di lingkaran gelap, batang
 * progres berwarna metriknya. Angkanya oranye, bukan merah: merah di layar ini
 * sudah dipakai tombol utama, dan aturan palet membatasinya satu titik.
 */
const Benahi = ({ item }: { item: OverviewItem }) => {
  const metrik = METRIK[item.key];

  return (
    <View style={styles.row}>
      <IconCircle size={36}>{metrik.icon(metrik.color)}</IconCircle>

      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text variant="label" numberOfLines={1} style={styles.rowTitle}>
            {item.title}
          </Text>
          <Text variant="label" tone="warning">
            {item.value}
          </Text>
        </View>
        <Text variant="caption" tone="secondary">
          {item.detail}
        </Text>
        {item.progress !== null ? (
          <ProgressBar progress={item.progress} color={metrik.color} height={4} />
        ) : null}
      </View>
    </View>
  );
};

/** Satu hal yang sudah bagus, lebih ringkas dari yang perlu dibenahi. */
const Bagus = ({ item }: { item: OverviewItem }) => {
  const metrik = METRIK[item.key];

  return (
    <View style={styles.good}>
      <IconCircle size={30}>{metrik.icon(metrik.color)}</IconCircle>
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text variant="label" numberOfLines={1} style={styles.rowTitle}>
            {item.title}
          </Text>
          <Text variant="caption" tone="success">
            {item.value}
          </Text>
        </View>
        <Text variant="caption" tone="tertiary">
          {item.detail}
        </Text>
      </View>
    </View>
  );
};

/**
 * Overview di beranda, tepat di bawah kartu kalori: gula hari ini, lalu yang
 * perlu dibenahi dan yang sudah bagus dari tujuh hari terakhir dan kemarin.
 *
 * Semua kalimat dan angkanya datang dari backend (GET /api/summary/overview),
 * dihitung aturan tetap, bukan model, supaya mobile dan web menulis hal yang
 * sama persis dan kartunya murah dibuka berkali-kali.
 *
 * Dibangun dari komponen yang sudah ada (SectionHeader, GoalProgress,
 * IconCircle, ProgressBar). Versi pertamanya memakai latar ikon berwarna dan
 * merah untuk yang jauh dari target, dua-duanya melanggar aturan desain.
 */
export const OverviewCard = ({ data }: { data: DailyOverview }) => {
  const { improve, good, sugar_today: gula } = data;

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHeader
          title="Overview"
          action={
            <Text variant="caption" tone={improve.length > 0 ? 'warning' : 'success'}>
              {improve.length > 0 ? `${String(improve.length)} perlu dibenahi` : 'Semua aman'}
            </Text>
          }
        />

        {/* Gula total lawan batas ATAS hariannya, bukan target yang dikejar. */}
        <GoalProgress
          label="Gula hari ini"
          value={gula.grams}
          target={gula.max_g}
          unit="g"
          color={gula.grams > gula.max_g ? colors.warning : macroColors.sugar}
        />

        {improve.length > 0 ? (
          <View style={styles.section}>
            <Text variant="overline" tone="tertiary">
              Perlu dibenahi
            </Text>
            {improve.map((item) => (
              <Benahi key={item.key} item={item} />
            ))}
          </View>
        ) : null}

        {good.length > 0 ? (
          <View style={styles.section}>
            <Text variant="overline" tone="tertiary">
              Sudah bagus
            </Text>
            {good.map((item) => (
              <Bagus key={item.key} item={item} />
            ))}
          </View>
        ) : null}

        {improve.length === 0 && good.length === 0 ? (
          <Text variant="caption" tone="secondary">
            Belum cukup catatan untuk dinilai. Catat beberapa hari dulu.
          </Text>
        ) : null}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  section: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  rowBody: { flex: 1, gap: spacing.xs },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowTitle: { flex: 1 },
  good: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
});
