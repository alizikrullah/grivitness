import { useState } from 'react';

import { HighlightBarChart, TrendChart } from '@/components/features/Charts';
import { Card, Chip, Loading, SectionHeader, StatPill } from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { useWeeklySummary } from '@/services/misc.service';
import { useStepsRange } from '@/services/steps.service';
import { useWeightRange } from '@/services/weight.service';
import { dateRange, dayLabel, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { duration, kg, signed, thousands, toNum } from '@/utils/format';

const RENTANG = [
  { hari: 7, label: '7 hari' },
  { hari: 30, label: '30 hari' },
  { hari: 90, label: '90 hari' },
] as const;

export const ProgressPage = () => {
  const hariIni = todayWIB();
  const [hari, setHari] = useState<number>(30);

  const awal = shiftDays(hariIni, -(hari - 1));

  const berat = useWeightRange(awal, hariIni);
  const langkah = useStepsRange(awal, hariIni);
  const mingguan = useWeeklySummary(shiftDays(hariIni, -6));

  const titikBerat = dateRange(awal, hariIni).map((tanggal) => ({
    label: shortDate(tanggal),
    value: toNum(berat.data?.find((l) => l.logged_at === tanggal)?.weight_kg),
  }));

  // Chart langkah dibatasi 14 batang. Sembilan puluh batang di lebar layar
  // desktop pun jadi garis-garis tipis yang tidak terbaca.
  const awalLangkah = shiftDays(hariIni, -Math.min(hari, 14) + 1);
  const batangLangkah = dateRange(awalLangkah, hariIni).map((tanggal) => ({
    label: dayLabel(tanggal),
    value: langkah.data?.find((l) => l.logged_at === tanggal)?.steps ?? null,
  }));

  /**
   * Nilai hari ini dipisah supaya bisa ditampilkan tanpa interaksi apa pun.
   * Tooltip Recharts hanya muncul saat kursor masuk, dan di layar sentuh hover
   * tidak pernah terjadi -- tanpa ini, angka pastinya tidak pernah terbaca.
   */
  const langkahHariIni = batangLangkah.at(-1)?.value ?? null;

  const w = mingguan.data;
  const perubahan =
    w?.weight_start != null && w.weight_end != null ? w.weight_end - w.weight_start : null;

  return (
    <div className="stack">
      <SectionHeader
        title="Progres"
        action={
          <div className="chip-group">
            {RENTANG.map(({ hari: n, label }) => (
              <Chip key={n} label={label} active={hari === n} onClick={() => setHari(n)} />
            ))}
          </div>
        }
      />

      <SectionHeader title="Berat badan" />

      <Card>
        {berat.isPending ? (
          <Loading />
        ) : (
          <TrendChart data={titikBerat} color={metricColors.weight} unit=" kg" height={260} />
        )}
      </Card>

      <SectionHeader title="Langkah" />

      <Card>
        {langkah.isPending ? (
          <Loading />
        ) : (
          <div className="stack-sm">
            <span className="t-caption c-secondary">
              Hari ini{' '}
              {langkahHariIni === null ? 'belum tercatat' : thousands(langkahHariIni) + ' langkah'}
            </span>

            <HighlightBarChart data={batangLangkah} color={metricColors.steps} height={220} />
          </div>
        )}
      </Card>

      <SectionHeader title="Rekap tujuh hari terakhir" />

      {mingguan.isPending ? (
        <Loading />
      ) : (
        <div className="grid-4">
          <Card padding="md">
            <div className="stack-xs">
              <span className="t-overline c-tertiary">Perubahan berat</span>
              <span className="t-h2" style={{ color: metricColors.weight }}>
                {perubahan === null ? '-' : signed(perubahan) + ' kg'}
              </span>
              <span className="t-caption c-tertiary">
                {w?.weight_start != null && w.weight_end != null
                  ? kg(w.weight_start) + ' → ' + kg(w.weight_end) + ' kg'
                  : 'Butuh dua penimbangan'}
              </span>
            </div>
          </Card>

          <Card padding="md">
            <div className="stack-xs">
              {/*
                TOTAL, bukan rata-rata. Rata-rata membagi dengan tujuh hari
                kalender termasuk hari yang tidak dicatat, jadi satu kali makan
                600 kkal muncul sebagai "86 kkal" — angka yang benar secara
                aritmetika tapi menyesatkan sebagai informasi.
              */}
              <span className="t-overline c-tertiary">Total kalori masuk</span>
              <span className="t-h2" style={{ color: metricColors.calories }}>
                {thousands(w?.total_calories_in ?? 0)}
              </span>
              <span className="t-caption c-tertiary">
                Rata-rata {thousands(w?.avg_calories_in ?? 0)} per hari
              </span>
            </div>
          </Card>

          <Card padding="md">
            <div className="stack-xs">
              <span className="t-overline c-tertiary">Total langkah</span>
              <span className="t-h2" style={{ color: metricColors.steps }}>
                {thousands(w?.total_steps ?? 0)}
              </span>
              <span className="t-caption c-tertiary">
                Rata-rata {thousands(w?.avg_steps ?? 0)} per hari
              </span>
            </div>
          </Card>

          <Card padding="md">
            <div className="stack-xs">
              <span className="t-overline c-tertiary">Olahraga</span>
              <span className="t-h2" style={{ color: metricColors.workout }}>
                {duration(w?.total_workout_minutes ?? 0)}
              </span>
              <span className="t-caption c-tertiary">
                {thousands(w?.total_workout_calories ?? 0)} kkal terbakar
              </span>
            </div>
          </Card>
        </div>
      )}

      {w ? (
        <Card>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <StatPill label="Tidur rata-rata" value={duration(w.avg_sleep_minutes)} />
            <StatPill label="Total minum" value={thousands(w.total_water_ml) + ' ml'} />
            {/*
              Dinamai "Hari ditimbang", bukan "Hari tercatat". Angkanya memang
              cuma menghitung baris weight_logs — menyebutnya pencatatan secara
              umum akan membuat user mengira hari yang dia isi makan dan
              olahraganya ikut terhitung.
            */}
            <StatPill label="Hari ditimbang" value={w.days_logged + ' dari ' + w.days} />
          </div>
        </Card>
      ) : null}
    </div>
  );
};
