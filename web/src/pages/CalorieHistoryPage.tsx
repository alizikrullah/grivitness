import { WatchIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { BalanceBarChart } from '@/components/features/Charts';
import { Card, ChipGroup, EmptyState, ErrorNote, Loading, SectionHeader } from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useCalorieHistory } from '@/services/misc.service';
import type { HistoryDay } from '@/types';
import { dayLabel, shortDate } from '@/utils/date';
import { thousands } from '@/utils/format';
import './CalorieHistoryPage.css';

const RENTANG = ['7', '14', '30'] as const;
const RENTANG_LABEL = { '7': '7 hari', '14': '14 hari', '30': '30 hari' };

/** "+420" untuk defisit, "-180" untuk surplus. Tanda selalu ditulis. */
const tandaKkal = (n: number): string => (n >= 0 ? '+' : '-') + thousands(Math.abs(n));

/**
 * Riwayat kalori masuk vs keluar, halaman kontrol defisit. Padanan layar
 * calorie-history di mobile; alasan desainnya ada di sana.
 */
export const CalorieHistoryPage = () => {
  const [rentang, setRentang] = useState<(typeof RENTANG)[number]>('14');
  const hari = Number(rentang);

  const riwayat = useCalorieHistory(hari);
  const d = riwayat.data;
  const s = d?.summary;

  const dataChart = (d?.days ?? []).map((h) => ({
    label: hari <= 14 ? dayLabel(h.date) : (shortDate(h.date).split(' ')[0] ?? ''),
    value: h.logged ? h.balance : null,
    caption: h.logged
      ? `${tandaKkal(h.balance)} kkal (masuk ${thousands(h.calories_in)}, keluar ${thousands(h.calories_out)})`
      : undefined,
  }));

  return (
    <div className="stack">
      <SectionHeader
        title="Riwayat kalori"
        action={
          <ChipGroup
            options={RENTANG}
            value={rentang}
            onChange={setRentang}
            labels={RENTANG_LABEL}
          />
        }
      />
      <span className="t-body c-secondary">Masuk lawan keluar, per hari.</span>

      {riwayat.isPending ? (
        <Loading />
      ) : riwayat.isError ? (
        <ErrorNote message={toApiError(riwayat.error).message} />
      ) : !d || s === undefined || s.days_logged === 0 ? (
        <EmptyState
          title="Belum ada yang bisa dibandingkan"
          message="Catat makanan minimal satu hari, dan riwayatnya muncul di sini."
        />
      ) : (
        <>
          <Card>
            <div className="stack">
              <div className="hist-ringkas">
                <Ringkas
                  label="Rata-rata masuk"
                  nilai={thousands(s.avg_calories_in)}
                  satuan="kkal"
                />
                <Ringkas
                  label="Rata-rata keluar"
                  nilai={thousands(s.avg_calories_out)}
                  satuan="kkal"
                />
                <Ringkas
                  label="Rata-rata defisit"
                  nilai={tandaKkal(s.avg_balance)}
                  satuan="kkal/hari"
                  kelas={s.avg_balance >= 0 ? 'c-success' : 'c-warning'}
                />
                <Ringkas
                  label="Hari defisit"
                  nilai={`${s.deficit_days} dari ${s.days_logged}`}
                  satuan="hari tercatat"
                />
              </div>
              <span className="t-caption c-tertiary">
                Rata-rata cuma dari hari yang makanannya tercatat. Hari kosong tidak dianggap
                defisit, cuma tidak dicatat.
              </span>
            </div>
          </Card>

          <Card>
            <div className="stack-sm">
              <span className="t-label">Defisit per hari</span>
              <span className="t-caption c-tertiary">
                Hijau ke atas berarti keluar lebih besar dari masuk. Merah ke bawah berarti lewat.
              </span>
              <BalanceBarChart data={dataChart} formatValue={(v) => tandaKkal(v) + ' kkal'} />
            </div>
          </Card>

          <SectionHeader title="Per hari" />

          <Card padding="md">
            <div>
              {[...d.days].reverse().map((h) => (
                <BarisHari key={h.date} hari={h} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

const Ringkas = ({
  label,
  nilai,
  satuan,
  kelas = '',
}: {
  label: string;
  nilai: string;
  satuan: string;
  kelas?: string;
}) => (
  <div className="stack-xs">
    <span className="t-caption c-tertiary">{label}</span>
    <span className={'t-h3 ' + kelas}>{nilai}</span>
    <span className="t-caption c-tertiary">{satuan}</span>
  </div>
);

const BarisHari = ({ hari }: { hari: HistoryDay }) => {
  if (!hari.logged) {
    return (
      <div className="hist-row">
        <span className="t-label c-tertiary flex-1">{shortDate(hari.date)}</span>
        <span className="t-caption c-tertiary">Tidak ada catatan makan</span>
      </div>
    );
  }

  const defisit = hari.balance >= 0;

  return (
    <div className="hist-row">
      <span className="flex-1 stack-xs">
        <span className="t-label">{shortDate(hari.date)}</span>
        <span className="t-caption c-secondary hist-baris-detail">
          Masuk {thousands(hari.calories_in)} ·{' '}
          {hari.calories_out_source === 'device' ? (
            <WatchIcon size={12} color={metricColors.device} weight="fill" />
          ) : null}{' '}
          Keluar {thousands(hari.calories_out)}
          {hari.calorie_budget !== null ? ` · Jatah ${thousands(hari.calorie_budget)}` : ''}
        </span>
      </span>
      <span className={'t-label ' + (defisit ? 'c-success' : 'c-warning')}>
        {tandaKkal(hari.balance)} kkal
      </span>
    </div>
  );
};
