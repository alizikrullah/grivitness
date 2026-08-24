import {
  ArrowRightIcon,
  BarbellIcon,
  DropIcon,
  FireIcon,
  FootprintsIcon,
  MoonStarsIcon,
  ScalesIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { MetricTile } from '@/components/features/MetricTile';
import { Card, Loading, Ring, SectionHeader, StatPill } from '@/components/ui';
import { colors, flame, metricColors } from '@/constants/colors';
import { useDailySummary, useStreak } from '@/services/misc.service';
import { useProfile } from '@/services/users.service';
import { todayWIB } from '@/utils/date';
import { duration, kg, ratio, thousands, volume } from '@/utils/format';
import './DashboardPage.css';

/**
 * Pembagian yang aman terhadap target yang belum tiba.
 *
 * Target datang dari backend, diturunkan dari berat, tinggi, usia, dan target
 * berat badan user — bukan lagi angka tetap yang sama untuk semua orang.
 */
const rasio = (nilai: number, target: number | undefined): number =>
  target && target > 0 ? nilai / target : 0;

export const DashboardPage = () => {
  const hariIni = todayWIB();
  const summary = useDailySummary(hariIni);
  const streak = useStreak();
  const profile = useProfile();

  const data = summary.data;
  const budget = data?.calorie_budget ?? null;

  if (summary.isPending) return <Loading />;

  return (
    <div className="stack">
      {/* Profil kosong berarti metabolisme tidak bisa dihitung, dan hampir semua
          angka di halaman ini jadi setengah benar. Diberitahukan di atas, bukan
          dibiarkan user menebak kenapa kalori keluarnya terlihat kecil. */}
      {!profile.isPending && !profile.data ? (
        <Link to="/profile" className="dash-notice">
          <WarningCircleIcon size={22} color={colors.warning} weight="duotone" />
          <span className="flex-1">
            <span className="t-label">Lengkapi profil kamu</span>
            <span className="t-caption c-secondary">
              Tinggi, usia, dan jenis pekerjaan dipakai menghitung kebutuhan kalori.
            </span>
          </span>
          <ArrowRightIcon size={18} color={colors.textSecondary} weight="bold" />
        </Link>
      ) : null}

      <div className="dash-top">
        <Card>
          <div className="dash-ring">
            <Ring
              progress={budget ? ratio(data?.calories_in ?? 0, budget) : 0}
              size={200}
              thickness={16}
              color={metricColors.calories}
            >
              <FireIcon size={22} weight="duotone" color={flame.outline} className="dash-flame" />
              <span className="t-metric">{thousands(data?.calories_in ?? 0)}</span>
              <span className="t-caption c-secondary">
                {budget ? 'dari ' + thousands(budget) + ' kkal' : 'kalori masuk'}
              </span>
            </Ring>

            <div className="dash-burn">
              <div className="dash-burn-item">
                <span className="t-overline c-tertiary">Keluar</span>
                <span className="t-h3">{thousands(data?.calories_out ?? 0)}</span>
              </div>

              <span className="dash-burn-divider" />

              <div className="dash-burn-item">
                <span className="t-overline c-tertiary">Sisa</span>
                <span className="t-h3">
                  {data?.calories_remaining === null || data?.calories_remaining === undefined
                    ? '-'
                    : thousands(data.calories_remaining)}
                </span>
              </div>

              <span className="dash-burn-divider" />

              <div className="dash-burn-item">
                <span className="t-overline c-tertiary">Berat</span>
                <span className="t-h3">
                  {data?.weight_kg === null || data?.weight_kg === undefined
                    ? '-'
                    : kg(data.weight_kg) + ' kg'}
                </span>
              </div>
            </div>

            {/*
              Susunan "keluar" dibuka, bukan cuma satu angka besar yang harus
              dipercaya. Ketiganya TIDAK saling tumpang tindih: 24 jam dibagi
              habis, jadi jam olahraga dan jam berjalan diambil dari jatah
              metabolisme, bukan ditambahkan di atasnya.
            */}
            {data?.energy ? (
              <span className="t-caption c-tertiary dash-breakdown">
                {thousands(data.energy.baseline)} metabolisme + {data.energy.step_calories} langkah +{' '}
                {data.energy.workout_calories} olahraga
              </span>
            ) : null}
          </div>
        </Card>

        <div className="stack">
          <Card padding="md">
            <div className="row-between">
              <div className="stack-xs">
                <span className="t-overline c-tertiary">Runtutan</span>
                <span className="t-h2">{streak.data?.current_streak ?? 0} hari</span>
              </div>
              <StatPill label="Terpanjang" value={(streak.data?.longest_streak ?? 0) + ' hari'} />
            </div>
          </Card>

          <div className="grid-2">
            <MetricTile
              icon={<FootprintsIcon size={16} color={metricColors.steps} weight="fill" />}
              label="Langkah"
              value={thousands(data?.steps ?? 0)}
              unit={'dari ' + thousands(data?.targets.steps.steps ?? 0)}
              progress={rasio(data?.steps ?? 0, data?.targets.steps.steps)}
              color={metricColors.steps}
              to="/log/steps"
            />
            <MetricTile
              icon={<DropIcon size={16} color={metricColors.water} weight="fill" />}
              label="Air"
              value={volume(data?.water_ml ?? 0)}
              unit={'dari ' + volume(data?.targets.water_ml ?? 0)}
              progress={rasio(data?.water_ml ?? 0, data?.targets.water_ml)}
              color={metricColors.water}
              to="/log/water"
            />
            <MetricTile
              icon={<MoonStarsIcon size={16} color={metricColors.sleep} weight="fill" />}
              label="Tidur"
              value={duration(data?.sleep_minutes ?? 0)}
              // Rentang, bukan satu angka — rekomendasinya memang 7-9 jam, dan
              // menampilkannya sebagai "8 jam tepat" memalsukan ketelitian yang
              // tidak dimiliki penelitiannya.
              unit={
                data
                  ? duration(data.targets.sleep.min_minutes) +
                    '–' +
                    duration(data.targets.sleep.max_minutes)
                  : undefined
              }
              progress={rasio(data?.sleep_minutes ?? 0, data?.targets.sleep.min_minutes)}
              color={metricColors.sleep}
              to="/log/sleep"
            />
            <MetricTile
              icon={<BarbellIcon size={16} color={metricColors.workout} weight="fill" />}
              label="Olahraga"
              value={duration(data?.workout_minutes ?? 0)}
              // Durasi saja tidak menjawab pertanyaan yang sebenarnya dicari:
              // berapa yang terbakar. Keduanya ditampilkan berdampingan.
              unit={thousands(data?.workout_calories ?? 0) + ' kkal'}
              color={metricColors.workout}
              to="/log/workout"
            />
          </div>
        </div>
      </div>

      <SectionHeader
        title="Komposisi gizi"
        action={
          data?.targets.macros ? (
            <span className="t-caption c-tertiary">Target dari jatah kalorimu</span>
          ) : null
        }
      />

      <Card>
        <div className="grid-3">
          <MacroBar
            label="Protein"
            value={data?.protein_g ?? 0}
            target={data?.targets.macros?.protein_g}
            color={colors.success}
          />
          <MacroBar
            label="Karbohidrat"
            value={data?.carbs_g ?? 0}
            target={data?.targets.macros?.carbs_g}
            color={metricColors.steps}
          />
          <MacroBar
            label="Lemak"
            value={data?.fat_g ?? 0}
            target={data?.targets.macros?.fat_g}
            color={metricColors.calories}
          />
        </div>
      </Card>

      <SectionHeader title="Catat cepat" />

      <div className="grid-4">
        <QuickLink to="/log/weight" label="Berat" icon={<ScalesIcon size={20} weight="duotone" />} />
        <QuickLink to="/log/food" label="Makan" icon={<FireIcon size={20} weight="duotone" />} />
        <QuickLink
          to="/log/workout"
          label="Olahraga"
          icon={<BarbellIcon size={20} weight="duotone" />}
        />
        <QuickLink to="/log/water" label="Minum" icon={<DropIcon size={20} weight="duotone" />} />
      </div>
    </div>
  );
};

const MacroBar = ({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target?: number;
  color: string;
}) => (
  <div className="stack-xs">
    <div className="row-between">
      <span className="t-caption c-secondary">{label}</span>
      <span className="t-label">
        {Math.round(value)}
        {target ? <span className="c-tertiary"> / {target} g</span> : ' g'}
      </span>
    </div>
    <div className="misc-bar">
      <div
        className="misc-bar-fill"
        style={{
          width: Math.min(target ? value / target : 0, 1) * 100 + '%',
          background: color,
        }}
      />
    </div>
  </div>
);

const QuickLink = ({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) => (
  <Link to={to} className="dash-quick">
    <span className="dash-quick-icon">{icon}</span>
    <span className="t-label">{label}</span>
  </Link>
);
