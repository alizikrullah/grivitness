import { MoonStarsIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  SectionHeader,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useCreateSleep, useDeleteSleep, useSleepDate } from '@/services/sleep.service';
import {
  dayPhrase,
  isFutureTime,
  mightMeanTonight,
  sleepDayNow,
  sleepRange,
  sleepRangeLabel,
  timeWIB,
  todayWIB,
} from '@/utils/date';
import { duration } from '@/utils/format';
import { LogActions } from './LogActions';

const FORMAT_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const SleepPanel = () => {
  /**
   * Tanggal yang sedang dilihat: "tidur untuk pagi hari itu". Jam mulai 18:00
   * ke atas berarti malam sebelumnya, di bawahnya tanggal itu sendiri
   * (sleepRange di utils/date, sama dengan sleepDay() di backend). Satu malam
   * yang terpotong dicatat dua kali di tanggal yang SAMA.
   */
  const [tanggal, setTanggal] = useState(todayWIB());

  const today = useSleepDate(tanggal);
  const create = useCreateSleep();
  const hapus = useDeleteSleep();

  const [mulai, setMulai] = useState('22:30');
  const [bangun, setBangun] = useState('06:30');
  const [kualitas, setKualitas] = useState(4);
  const [error, setError] = useState<string | null>(null);

  // Dihitung terhadap tanggal yang sedang dilihat, bukan terhadap hari ini,
  // supaya tidur yang dicatat sambil menelusuri hari lampau jatuh ke hari
  // yang benar.
  const rentang =
    FORMAT_JAM.test(mulai) && FORMAT_JAM.test(bangun) ? sleepRange(tanggal, mulai, bangun) : null;

  const menit = rentang
    ? Math.round((new Date(rentang.end).getTime() - new Date(rentang.start).getTime()) / 60_000)
    : 0;

  /** Jam bangun yang belum terjadi hampir pasti tanggal yang salah. */
  const belumTerjadi = rentang !== null && isFutureTime(rentang.end);

  /** Jam 18:00 ke atas di hari ini bisa juga berarti hari ini sendiri, lihat mightMeanTonight. */
  const mungkinSoreIni = rentang !== null && mightMeanTonight(tanggal, mulai, bangun);

  const simpan = () => {
    setError(null);

    if (rentang === null || menit <= 0 || menit > 24 * 60) {
      setError('Durasi tidur tidak masuk akal. Periksa lagi jamnya.');
      return;
    }

    if (belumTerjadi) {
      setError('Jam bangun itu belum terjadi. Cek lagi tanggal dan jamnya.');
      return;
    }

    create.mutate(
      { sleep_start: rentang.start, sleep_end: rentang.end, quality_score: kualitas },
      { onError: (e) => setError(toApiError(e).message) },
    );
  };

  const total = today.data?.total_minutes ?? 0;
  const logs = today.data?.logs ?? [];

  return (
    <>
      <SectionHeader title="Catat tidur" />

      <DateNav
        value={tanggal}
        onChange={setTanggal}
        section="sleep"
        label="Tidur untuk pagi tanggal"
        maxDate={sleepDayNow()}
      />

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

          {rentang && menit > 0 ? (
            <span className={'t-caption ' + (belumTerjadi ? 'c-warning' : 'c-tertiary')}>
              {duration(menit)}, {sleepRangeLabel(rentang.start, rentang.end)}
              {belumTerjadi ? ', belum terjadi' : ''}
            </span>
          ) : null}

          {mungkinSoreIni ? (
            <span className="t-caption c-secondary">
              Kalau jam itu maksudnya hari ini, geser tanggal ke besok.
            </span>
          ) : null}

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
                    · {timeWIB(log.sleep_start)} - {timeWIB(log.sleep_end)} WIB · kualitas{' '}
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
