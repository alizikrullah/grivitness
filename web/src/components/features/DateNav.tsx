import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { Button, Calendar, Modal } from '@/components/ui';
import { useCalendarDays } from '@/services/misc.service';
import type { CalendarSection } from '@/types';
import { monthEnd, monthStart, navDateLabel, shiftDays, todayWIB } from '@/utils/date';
import './DateNav.css';

/** Apa yang ditandai titik hijau di tiap panel, untuk keterangan di bawah kalender. */
const ISI: Record<CalendarSection, string> = {
  food: 'catatan makan',
  water: 'catatan minum',
  workout: 'catatan olahraga',
  steps: 'catatan langkah',
  sleep: 'catatan tidur',
  weight: 'catatan berat',
  mood: 'catatan mood',
  'body-photo': 'foto badan atau lingkar pinggang',
  'device-energy': 'angka jam tangan',
};

interface DateNavProps {
  value: string;
  onChange: (date: string) => void;
  /** Panel yang memakai: menentukan tanggal mana yang bertitik. */
  section: CalendarSection;
  /** Keterangan di atas kotak, mis. "Tanggal bangun" untuk tidur. */
  label?: string;
}

/**
 * Kotak tanggal panel catat: "‹ Hari ini, Sab 3 Okt ›". Padanan mobile.
 *
 * Panah pindah sehari. Klik tengahnya untuk kalender sebulan yang menandai
 * hari-hari yang ADA catatannya di panel ini, jadi hari yang lupa diisi
 * kelihatan dari titiknya yang tidak ada. Input date bawaan browser yang
 * dulu dipakai tidak bisa menandai apa pun.
 */
export const DateNav = ({ value, onChange, section, label }: DateNavProps) => {
  const hariIni = todayWIB();
  const [buka, setBuka] = useState(false);
  const [bulan, setBulan] = useState(monthStart(value));

  const tanda = useCalendarDays(section, monthStart(bulan), monthEnd(bulan), buka);
  const kuning = new Set(tanda.data?.incomplete ?? []);
  const hijau = new Set((tanda.data?.dates ?? []).filter((t) => !kuning.has(t)));

  const pilih = (tanggal: string) => {
    onChange(tanggal);
    setBuka(false);
  };

  return (
    <div className="datenav-wrap">
      {label ? <span className="t-caption c-secondary">{label}</span> : null}

      <div className="datenav">
        <button
          type="button"
          className="datenav-panah"
          onClick={() => onChange(shiftDays(value, -1))}
          aria-label="Sehari sebelumnya"
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>

        <button
          type="button"
          className="datenav-tengah"
          onClick={() => {
            setBulan(monthStart(value));
            setBuka(true);
          }}
        >
          <CalendarBlankIcon size={18} weight="duotone" />
          <span className="t-label">{navDateLabel(value)}</span>
        </button>

        <button
          type="button"
          className="datenav-panah"
          onClick={() => onChange(shiftDays(value, 1))}
          disabled={value >= hariIni}
          aria-label="Sehari sesudahnya"
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>

      <Modal open={buka} title="Pilih tanggal" onClose={() => setBuka(false)}>
        <Calendar
          month={bulan}
          selected={value}
          maxDate={hariIni}
          marked={hijau}
          warned={kuning}
          onSelect={pilih}
          onMonthChange={setBulan}
        />

        <div className="datenav-legend">
          <span className="datenav-legend-item t-caption c-secondary">
            <span className="datenav-dot datenav-dot-hijau" /> Ada {ISI[section]}
          </span>
          {section === 'food' ? (
            <span className="datenav-legend-item t-caption c-secondary">
              <span className="datenav-dot datenav-dot-kuning" /> Ditandai belum lengkap
            </span>
          ) : null}
        </div>

        {value === hariIni ? null : (
          <Button
            label="Kembali ke hari ini"
            variant="secondary"
            full
            onClick={() => pilih(hariIni)}
          />
        )}
      </Modal>
    </div>
  );
};
