import {
  FireIcon,
  FootprintsIcon,
  TrendDownIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { ObservedTdeeNote } from '@/components/features/ObservedTdeeNote';
import { Card, Divider, Row } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import type { DailyTargets, GoalWithProgress } from '@/types';
import { longDate, shiftDays, todayWIB } from '@/utils/date';
import { thousands } from '@/utils/format';
import './PlanCard.css';

interface PlanCardProps {
  goal: GoalWithProgress;
  /** Target makro dari rekap harian. Null kalau belum tersedia. */
  targets?: DailyTargets | null;
}

const kgPerMinggu = (n: number): string => Math.abs(n).toFixed(2).replace('.', ',') + ' kg';

/**
 * Menjelaskan rencana penurunan berat badan dengan angka yang bisa dijalankan.
 *
 * Yang paling penting di kartu ini adalah bagian peringatannya. Target yang
 * terlalu agresif TIDAK dipaksakan jadi anjuran — backend menahan budget di
 * batas aman, lalu kartu ini menyampaikan dua hal yang biasanya disembunyikan
 * aplikasi sejenis: kapan targetmu benar-benar tercapai pada jatah yang aman,
 * dan berapa langkah tambahan yang bisa menutup selisihnya.
 *
 * Menyembunyikan itu berarti user menjalankan program yang diam-diam tidak
 * mungkin berhasil, lalu menyalahkan dirinya sendiri saat tidak berhasil.
 */
export const PlanCard = ({ goal, targets }: PlanCardProps) => {
  const plan = goal.plan;

  if (!plan) {
    return (
      <Card variant="outline" padding="md">
        <span className="t-caption c-tertiary">
          Isi profil dan catat berat badan dulu supaya rencananya bisa dihitung.
        </span>
      </Card>
    );
  }

  const turun = plan.daily_deficit > 0;
  const tanggalNyata =
    plan.projected_days === null ? null : shiftDays(todayWIB(), plan.projected_days);

  return (
    <Card>
      <div className="stack-sm">
        <div className="plan-head">
          <span className="plan-head-icon">
            <TrendDownIcon size={20} color={colors.primary} weight="duotone" />
          </span>

          <div className="stack-xs flex-1">
            <span className="t-label">
              {turun ? 'Turun ' : 'Naik '}
              {kgPerMinggu(plan.weekly_rate_kg)} per minggu
            </span>
            <span className="t-caption c-tertiary">
              Batas aman {kgPerMinggu(plan.safe_weekly_rate_kg)} per minggu
            </span>
          </div>
        </div>

        <Divider />

        <Row
          label="Jatah harian"
          value={thousands(plan.daily_calorie_budget) + ' kkal'}
          icon={<FireIcon size={16} color={metricColors.calories} weight="duotone" />}
          tone="accent"
        />
        <Row
          label={turun ? 'Defisit harian' : 'Surplus harian'}
          value={thousands(Math.abs(plan.daily_deficit)) + ' kkal'}
        />
        <Row
          label={goal.observed_tdee?.measured === null ? 'Perkiraan pengeluaran' : 'Pengeluaran'}
          value={thousands(plan.tdee) + ' kkal'}
        />

        {goal.observed_tdee ? <ObservedTdeeNote observed={goal.observed_tdee} /> : null}

        {targets?.macros ? (
          <>
            <Divider />
            {/*
              Protein didahulukan karena dialah yang menentukan apakah berat yang
              hilang itu lemak atau otot — dan otot itu yang menjaga metabolisme
              tetap tinggi setelah programnya selesai.
            */}
            <Row label="Protein" value={targets.macros.protein_g + ' g'} tone="success" />
            <Row label="Karbohidrat" value={targets.macros.carbs_g + ' g'} />
            <Row label="Lemak" value={targets.macros.fat_g + ' g'} />
          </>
        ) : null}

        {!plan.achievable ? (
          <div className="plan-warn">
            <WarningCircleIcon size={18} color={colors.warning} weight="duotone" />

            <div className="stack-xs flex-1">
              <span className="t-label">Targetmu lebih cepat dari yang aman</span>

              <span className="t-caption c-secondary">
                Mengejar tanggal itu butuh defisit {thousands(plan.required_deficit)} kkal per hari.
                Jatah di atas ditahan di batas aman supaya kamu tidak kehilangan otot.
                {tanggalNyata
                  ? ' Dengan jatah itu, targetmu tercapai sekitar ' + longDate(tanggalNyata) + '.'
                  : ''}
              </span>

              {plan.extra_steps_needed > 0 ? (
                <span className="plan-steps t-caption c-secondary">
                  <FootprintsIcon size={14} color={metricColors.steps} weight="fill" />
                  Tambah {thousands(plan.extra_steps_needed)} langkah per hari untuk mengejar
                  tanggal aslinya.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
};
