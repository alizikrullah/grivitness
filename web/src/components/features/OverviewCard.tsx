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
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { Card, ProgressBar } from '@/components/ui';
import { colors, macroColors, metricColors, tint } from '@/constants/colors';
import type { DailyOverview, OverviewItem, OverviewKey } from '@/types';
import './OverviewCard.css';

/** Ikon dan warna per metrik, padanan OverviewCard mobile. */
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

const Benahi = ({ item }: { item: OverviewItem }) => {
  const metrik = METRIK[item.key];
  const warna = warnaTingkat(item);

  return (
    <div className="ov-row">
      <span className="ov-row-icon" style={{ background: tint(metrik.color, 0.14) }}>
        {metrik.icon(metrik.color)}
      </span>
      <div className="ov-row-body">
        <div className="ov-row-head">
          <span className="t-label ov-row-title">{item.title}</span>
          <span className="t-label" style={{ color: warna }}>
            {item.value}
          </span>
        </div>
        <span className="t-caption c-secondary">{item.detail}</span>
        {item.progress !== null ? <ProgressBar progress={item.progress} color={warna} /> : null}
      </div>
    </div>
  );
};

const Bagus = ({ item }: { item: OverviewItem }) => (
  <div className="ov-good">
    <CheckCircleIcon size={18} color={colors.success} weight="fill" className="ov-good-icon" />
    <div className="ov-row-body">
      <div className="ov-row-head">
        <span className="t-label ov-row-title">{item.title}</span>
        <span className="t-caption c-secondary">{item.value}</span>
      </div>
      <span className="t-caption c-tertiary">{item.detail}</span>
    </div>
  </div>
);

/**
 * Overview beranda, padanan mobile: gula hari ini, lalu yang perlu dibenahi
 * dan yang sudah bagus dari tujuh hari terakhir dan kemarin. Kalimat dan
 * angkanya dari backend, dihitung aturan tetap, bukan model.
 *
 * Di layar lebar kedua daftar berdampingan, di layar sempit bertumpuk.
 */
export const OverviewCard = ({ data }: { data: DailyOverview }) => {
  const { improve, good, sugar_today: gula } = data;
  const gulaLewat = gula.grams > gula.max_g;

  return (
    <Card>
      <div className="ov">
        <div className="ov-head">
          <span className="ov-head-icon">
            <SparkleIcon size={18} color={colors.primary} weight="fill" />
          </span>
          <span className="t-h3 flex-1">Overview</span>
          <span
            className={
              't-caption ov-badge ' + (improve.length > 0 ? 'ov-badge-warn' : 'ov-badge-good')
            }
          >
            {improve.length > 0 ? `${String(improve.length)} perlu dibenahi` : 'Semua aman'}
          </span>
        </div>

        <div className="ov-sugar">
          <div className="row-between">
            <span className="ov-sugar-label">
              <CubeIcon size={16} color={macroColors.sugar} weight="fill" />
              <span className="t-label c-secondary">Gula hari ini</span>
            </span>
            <span className={'t-label' + (gulaLewat ? ' c-warning' : '')}>
              {String(gula.grams).replace('.', ',')}
              <span className="t-caption c-tertiary">{' / ' + String(gula.max_g) + ' g'}</span>
            </span>
          </div>
          <ProgressBar
            progress={gula.max_g > 0 ? gula.grams / gula.max_g : 0}
            color={gulaLewat ? colors.warning : macroColors.sugar}
          />
        </div>

        {improve.length > 0 || good.length > 0 ? (
          <div className="ov-cols">
            {improve.length > 0 ? (
              <section className="ov-section">
                <span className="t-overline c-tertiary">Perlu dibenahi</span>
                {improve.map((item) => (
                  <Benahi key={item.key} item={item} />
                ))}
              </section>
            ) : null}

            {good.length > 0 ? (
              <section className="ov-section">
                <span className="t-overline c-tertiary">Sudah bagus</span>
                {good.map((item) => (
                  <Bagus key={item.key} item={item} />
                ))}
              </section>
            ) : null}
          </div>
        ) : (
          <span className="t-caption c-secondary">
            Belum cukup catatan untuk dinilai. Catat beberapa hari dulu.
          </span>
        )}
      </div>
    </Card>
  );
};
