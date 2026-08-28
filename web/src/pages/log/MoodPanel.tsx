import { SmileyIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button, Card, DateField, ErrorNote, Loading, SectionHeader } from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { SCORE_LABEL } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import { useDeleteMood, useMoodDate, useSaveMood } from '@/services/mood.service';
import { dayPhrase, todayWIB } from '@/utils/date';
import { LogActions } from './LogActions';

const SkorPicker = ({
  label,
  value,
  onChange,
  jenis,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  jenis: 'mood' | 'energy';
}) => (
  <div className="stack-xs">
    <div className="row-between">
      <span className="t-label c-secondary">{label}</span>
      <span className="t-caption c-tertiary">{SCORE_LABEL[jenis][value] ?? ''}</span>
    </div>

    <div className="chip-group">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={'chip' + (value === n ? ' chip-active' : '')}
        >
          {n}
        </button>
      ))}
    </div>
  </div>
);

export const MoodPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());

  const today = useMoodDate(tanggal);
  const save = useSaveMood();
  const hapus = useDeleteMood();

  const [mood, setMood] = useState(3);
  const [energi, setEnergi] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /**
   * Skor dikembalikan ke nilai tengah saat pindah tanggal, disesuaikan saat
   * render dan bukan lewat useEffect. Tanpa ini, skor hari ini ikut terbawa ke
   * tanggal lain dan tersimpan ke hari yang salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(tanggal);
  if (tanggal !== tanggalTerakhir) {
    setTanggalTerakhir(tanggal);
    setMood(3);
    setEnergi(3);
    setError(null);
    setPesan(null);
  }

  const simpan = () => {
    setError(null);
    setPesan(null);

    save.mutate(
      // Satu baris per hari, jadi mencatat ulang pada tanggal yang sama harus
      // memperbarui baris yang ada, bukan menambah baris baru.
      { id: today.data?.id, mood_score: mood, energy_score: energi, logged_at: tanggal },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => setPesan('Mood tersimpan'),
      },
    );
  };

  return (
    <>
      <SectionHeader title={'Mood ' + dayPhrase(tanggal)} />

      <DateField value={tanggal} onChange={setTanggal} />

      <Card>
        <div className="stack">
          <SkorPicker label="Suasana hati" value={mood} onChange={setMood} jenis="mood" />
          <SkorPicker label="Tingkat energi" value={energi} onChange={setEnergi} jenis="energy" />

          {error ? <ErrorNote message={error} /> : null}
          {pesan ? <span className="t-caption c-success">{pesan}</span> : null}

          <Button
            label={today.data ? 'Perbarui' : 'Simpan'}
            size="lg"
            full
            onClick={simpan}
            loading={save.isPending}
          />
        </div>
      </Card>

      {today.isPending ? (
        <Loading />
      ) : today.data ? (
        <Card padding="md">
          <div className="log-row">
            <span className="log-row-icon">
              <SmileyIcon size={16} color={metricColors.mood} weight="fill" />
            </span>

            <span className="flex-1">
              <span className="t-body-medium">
                Mood {today.data.mood_score}/5 · Energi {today.data.energy_score}/5
              </span>
            </span>

            <LogActions
              onDelete={() =>
                hapus.mutate(today.data?.id ?? '', {
                  onError: (e) => setError(toApiError(e).message),
                })
              }
              confirmMessage={'Hapus catatan mood ' + dayPhrase(tanggal) + '?'}
            />
          </div>
        </Card>
      ) : null}
    </>
  );
};
