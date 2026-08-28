import { MoonStarsIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  Button,
  Card,
  DateField,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  SectionHeader,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useCreateSleep, useDeleteSleep, useSleepDate } from '@/services/sleep.service';
import { dayPhrase, shiftDays, timeWIB, todayWIB, wibToISO } from '@/utils/date';
import { duration } from '@/utils/format';
import { LogActions } from './LogActions';

export const SleepPanel = () => {
  /**
   * Tanggal yang sedang dilihat, yaitu tanggal BANGUN. Backend mengelompokkan
   * tidur menurut hari bangunnya.
   */
  const [tanggal, setTanggal] = useState(todayWIB());

  const today = useSleepDate(tanggal);
  const create = useCreateSleep();
  const hapus = useDeleteSleep();

  const [mulai, setMulai] = useState('22:30');
  const [bangun, setBangun] = useState('06:30');
  const [kualitas, setKualitas] = useState(4);
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    /**
     * Tidur hampir selalu melewati tengah malam. Kalau jam mulai lebih besar
     * daripada jam bangun, artinya tidurnya dimulai SEHARI SEBELUMNYA; tanpa
     * penyesuaian ini durasinya jadi negatif dan backend menolaknya.
     *
     * Dihitung terhadap tanggal yang sedang dilihat, bukan terhadap hari ini,
     * supaya tidur yang dicatat sambil menelusuri hari lampau jatuh ke hari
     * yang benar.
     */
    const tanggalMulai = mulai > bangun ? shiftDays(tanggal, -1) : tanggal;

    create.mutate(
      {
        sleep_start: wibToISO(tanggalMulai, mulai),
        sleep_end: wibToISO(tanggal, bangun),
        quality_score: kualitas,
      },
      { onError: (e) => setError(toApiError(e).message) },
    );
  };

  const total = today.data?.total_minutes ?? 0;
  const logs = today.data?.logs ?? [];

  return (
    <>
      <SectionHeader title="Catat tidur" />

      <DateField value={tanggal} onChange={setTanggal} label="Tanggal bangun" />

      <Card>
        <div className="stack">
          <div className="grid-2">
            <Input
              label="Mulai tidur"
              type="time"
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
            />
            <Input
              label="Bangun"
              type="time"
              value={bangun}
              onChange={(e) => setBangun(e.target.value)}
            />
          </div>

          <div className="stack-xs">
            <span className="t-label c-secondary">Kualitas tidur</span>
            <div className="chip-group">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setKualitas(n)}
                  aria-pressed={kualitas === n}
                  className={'chip' + (kualitas === n ? ' chip-active' : '')}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {error ? <ErrorNote message={error} /> : null}

          <Button label="Simpan" size="lg" full onClick={simpan} loading={create.isPending} />
        </div>
      </Card>

      <SectionHeader title={'Tidur ' + dayPhrase(tanggal)} />

      {today.isPending ? (
        <Loading />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<MoonStarsIcon size={28} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada catatan tidur"
          message="Catat jam tidur dan bangunmu di atas."
        />
      ) : (
        <Card padding="md">
          <div>
            <div className="row-between" style={{ paddingBottom: 'var(--space-md)' }}>
              <span className="t-caption c-secondary">Total</span>
              <span className="t-h3">{duration(total)}</span>
            </div>

            {logs.map((log) => (
              <div key={log.id} className="log-row">
                <span className="log-row-icon">
                  <MoonStarsIcon size={16} color={metricColors.sleep} weight="fill" />
                </span>

                <span className="flex-1">
                  <span className="t-body-medium">{duration(log.duration_minutes)}</span>
                  <span className="t-caption c-tertiary">
                    {' '}
                    · {timeWIB(log.sleep_start)} – {timeWIB(log.sleep_end)} WIB · kualitas{' '}
                    {log.quality_score}/5
                  </span>
                </span>

                <LogActions
                  onDelete={() =>
                    hapus.mutate(log.id, { onError: (e) => setError(toApiError(e).message) })
                  }
                  confirmMessage="Hapus catatan tidur ini?"
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
};
