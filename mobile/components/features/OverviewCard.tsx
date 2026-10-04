import {
  BarbellIcon,
  CheckCircleIcon,
  CubeIcon,
  DropIcon,
  EggIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  NotePencilIcon,
  ScalesIcon,
  SparkleIcon,
} from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, ProgressBar, Text } from '@/components/ui';
import { colors, macroColors, metricColors, tint } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import type { DailyOverview, OverviewItem, OverviewKey } from '@/types';

/** Ikon dan warna per metrik, warnanya sama dengan ikon metrik itu di layar lain. */
const METRIK: Record<OverviewKey, { color: string; icon: (color: string) => ReactNode }> = {
  calories: {
    color: metricColors.calories,
    icon: (c) => <ForkKnifeIcon size={18} color={c} weight="fill" />,
  },
  protein: {
    color: macroColors.protein,
    icon: (c) => <EggIcon size={18} color={c} weight="fill" />,
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

const warnaTingkat = (item: OverviewItem): string =>
  item.tone === 'bad' ? colors.danger : item.tone === 'warn' ? colors.warning : colors.success;

/** Satu hal yang perlu dibenahi: ikon metrik, judul, angka, keterangan, dan progresnya. */
const Benahi = ({ item }: { item: OverviewItem }) => {
  const metrik = METRIK[item.key];
  const warna = warnaTingkat(item);

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tint(metrik.color, 0.14) }]}>
        {metrik.icon(metrik.color)}
      </View>

      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text variant="label" numberOfLines={1} style={styles.rowTitle}>
            {item.title}
          </Text>
          <Text variant="label" color={warna}>
            {item.value}
          </Text>
        </View>
        <Text variant="caption" tone="secondary">
          {item.detail}
        </Text>
        {item.progress !== null ? (
          <ProgressBar progress={item.progress} color={warna} height={4} />
        ) : null}
      </View>
    </View>
  );
};

/** Satu hal yang sudah bagus, lebih ringkas dari yang perlu dibenahi. */
const Bagus = ({ item }: { item: OverviewItem }) => (
  <View style={styles.good}>
    <CheckCircleIcon size={18} color={colors.success} weight="fill" />
    <View style={styles.rowBody}>
      <View style={styles.rowHead}>
        <Text variant="label" numberOfLines={1} style={styles.rowTitle}>
          {item.title}
        </Text>
        <Text variant="caption" tone="secondary">
          {item.value}
        </Text>
      </View>
      <Text variant="caption" tone="tertiary">
        {item.detail}
      </Text>
    </View>
  </View>
);

/**
 * Overview di beranda, tepat di bawah kartu kalori: gula hari ini, lalu yang
 * perlu dibenahi dan yang sudah bagus dari tujuh hari terakhir dan kemarin.
 *
 * Semua kalimat dan angkanya datang dari backend (GET /api/summary/overview),
 * dihitung aturan tetap, bukan model, supaya mobile dan web menulis hal yang
 * sama persis dan kartunya murah dibuka berkali-kali.
 */
export const OverviewCard = ({ data }: { data: DailyOverview }) => {
  const { improve, good, sugar_today: gula } = data;
  const gulaLewat = gula.grams > gula.max_g;

  return (
    <Card>
      <View style={styles.wrap}>
        <View style={styles.head}>
          <View style={styles.headIcon}>
            <SparkleIcon size={18} color={colors.primary} weight="fill" />
          </View>
          <Text variant="h3" style={styles.headTitle}>
            Overview
          </Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: improve.length > 0 ? colors.warningSoft : colors.successSoft },
            ]}
          >
            <Text variant="caption" tone={improve.length > 0 ? 'warning' : 'success'}>
              {improve.length > 0 ? `${String(improve.length)} perlu dibenahi` : 'Semua aman'}
            </Text>
          </View>
        </View>

        <View style={styles.sugar}>
          <View style={styles.sugarHead}>
            <View style={styles.sugarLabel}>
              <CubeIcon size={16} color={macroColors.sugar} weight="fill" />
              <Text variant="label" tone="secondary">
                Gula hari ini
              </Text>
            </View>
            <Text variant="label" tone={gulaLewat ? 'warning' : 'primary'}>
              {String(gula.grams).replace('.', ',')}
              <Text variant="caption" tone="tertiary">
                {' / ' + String(gula.max_g) + ' g'}
              </Text>
            </Text>
          </View>
          <ProgressBar
            progress={gula.max_g > 0 ? gula.grams / gula.max_g : 0}
            color={gulaLewat ? colors.warning : macroColors.sugar}
            height={8}
          />
        </View>

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
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  headTitle: { flex: 1 },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  sugar: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  sugarHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sugarLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
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
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
