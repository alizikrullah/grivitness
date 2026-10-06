import {
  BarbellIcon,
  CubeIcon,
  DropIcon,
  FishIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  NotePencilIcon,
  ScalesIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { Card, ProgressBar } from '@/components/ui';
import { colors, macroColors, metricColors } from '@/constants/colors';
import type { DailyOverview, OverviewItem, OverviewKey } from '@/types';
import { thousands } from '@/utils/format';
import './OverviewCard.css';

/**
 * Ikon dan warna per metrik, padanan OverviewCard mobile. Ikonnya selalu di
 * lingkaran gelap seperti .tile-icon kartu metrik, tanpa latar berwarna.
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

/** Angkanya oranye, bukan merah: aturan palet membatasi merah satu titik per layar. */
const Benahi = ({ item }: { item: OverviewItem }) => {
  const metrik = METRIK[item.key];

  return (
    <div className="ov-row">
      <span className="ov-icon">{metrik.icon(metrik.color)}</span>
      <div className="ov-row-body">
        <div className="ov-row-head">
          <span className="t-label ov-row-title">{item.title}</span>
          <span className="t-label c-warning">{item.value}</span>
        </div>
        <span className="t-caption c-secondary">{item.detail}</span>
        {item.progress !== null ? (
          <ProgressBar progress={item.progress} color={metrik.color} />
        ) : null}
      </div>
    </div>
  );
};

const Bagus = ({ item }: { item: OverviewItem }) => {
  const metrik = METRIK[item.key];

  return (
    <div className="ov-good">
      <span className="ov-icon ov-icon-sm">{metrik.icon(metrik.color)}</span>
      <div className="ov-row-body">
        <div className="ov-row-head">
          <span className="t-label ov-row-title">{item.title}</span>
          <span className="t-caption c-success">{item.value}</span>
        </div>
        <span className="t-caption c-tertiary">{item.detail}</span>
      </div>
    </div>
  );
};

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
        <div className="row-between">
          <span className="t-h3">Overview</span>
          <span className={'t-caption ' + (improve.length > 0 ? 'c-warning' : 'c-success')}>
            {improve.length > 0 ? `${String(improve.length)} perlu dibenahi` : 'Semua aman'}
          </span>
        </div>

        {/* Gula total lawan batas ATAS hariannya, bentuknya sama dengan GoalProgress mobile. */}
        <div className="stack-xs">
          <div className="row-between">
            <span className="t-body-medium c-secondary">Gula hari ini</span>
            <span className="t-label">
              {thousands(gula.grams)}
              <span className="t-caption c-tertiary">{' / ' + thousands(gula.max_g) + ' g'}</span>
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
