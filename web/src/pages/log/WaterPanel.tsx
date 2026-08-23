import { DropIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Card, EmptyState, ErrorNote, Loading, Ring, SectionHeader } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useDailySummary } from '@/services/misc.service';
import { useAddWater, useDeleteWater, useWaterToday } from '@/services/water.service';
import { timeWIB, todayWIB } from '@/utils/date';
import { ratio, volume } from '@/utils/format';
import { LogActions } from './LogActions';

/** Takaran yang paling sering dipakai, supaya mencatat cukup satu klik. */
const TAKARAN = [150, 250, 500, 750];

export const WaterPanel = () => {
  const today = useWaterToday();
  const tambah = useAddWater();
  const hapus = useDeleteWater();

  const [error, setError] = useState<string | null>(null);

  const total = today.data?.total_ml ?? 0;

  /**
   * Target minum diturunkan backend dari berat badan dan usia — 35 ml per kg
   * untuk dewasa, lebih rendah untuk usia lanjut, plus tambahan sesuai lama
   * olahraga hari itu. Angka tetap 2500ml memaksa orang bertubuh kecil minum
   * berlebihan sementara yang bertubuh besar merasa cukup padahal belum.
   */
  const targetMl = useDailySummary(todayWIB()).data?.targets.water_ml ?? 0;

  const catat = (ml: number) => {
    setError(null);
    tambah.mutate({ amount_ml: ml }, { onError: (e) => setError(toApiError(e).message) });
  };

  return (
    <>
      <SectionHeader title="Minum air" />

      {today.isPending ? (
        <Loading />
      ) : (
        <>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Ring
                progress={ratio(total, targetMl)}
                size={190}
                thickness={14}
                color={metricColors.water}
              >
                <DropIcon size={22} color={metricColors.water} weight="duotone" />
                <span className="t-metric">{volume(total)}</span>
                <span className="t-caption c-secondary">dari {volume(targetMl)}</span>
              </Ring>
            </div>
          </Card>

          <SectionHeader title="Tambah cepat" />

          <div className="log-quick">
            {TAKARAN.map((ml) => (
              <button
                key={ml}
                type="button"
                onClick={() => catat(ml)}
                disabled={tambah.isPending}
                className="log-quick-item"
              >
                <PlusIcon size={16} color={metricColors.water} weight="bold" />
                <span className="t-label">{ml}</span>
                <span className="t-caption c-tertiary">ml</span>
              </button>
            ))}
          </div>

          {error ? <ErrorNote message={error} /> : null}

          <SectionHeader title="Catatan hari ini" />

          {(today.data?.logs.length ?? 0) === 0 ? (
            <EmptyState
              icon={<DropIcon size={28} color={colors.textTertiary} weight="duotone" />}
              title="Belum minum apa-apa"
              message="Klik salah satu takaran di atas untuk mencatat."
            />
          ) : (
            <Card padding="md">
              <div>
                {today.data?.logs.map((log) => (
                  <div key={log.id} className="log-row">
                    <span className="log-row-icon">
                      <DropIcon size={16} color={metricColors.water} weight="fill" />
                    </span>

                    <span className="flex-1">
                      <span className="t-body-medium">{log.amount_ml} ml</span>
                      <span className="t-caption c-tertiary"> · {timeWIB(log.logged_at)} WIB</span>
                    </span>

                    <LogActions
                      onDelete={() =>
                        hapus.mutate(log.id, { onError: (e) => setError(toApiError(e).message) })
                      }
                      confirmMessage={'Tegukan ' + log.amount_ml + ' ml akan dihapus.'}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
};
