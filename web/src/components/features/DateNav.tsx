import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { CalendarModal } from '@/components/features/CalendarModal';
import type { CalendarSection } from '@/types';
import { navDateLabel, shiftDays, todayWIB } from '@/utils/date';
import './DateNav.css';

interface DateNavProps {
  value: string;
  onChange: (date: string) => void;
  /** Panel yang memakai: menentukan tanggal mana yang bertitik. */
  section: CalendarSection;
  /** Keterangan di atas kotak, mis. "Tidur untuk pagi tanggal" di layar tidur. */
  label?: string;
  /** Tanggal terjauh yang boleh dipilih, bawaan hari ini. Layar tidur: sleepDayNow(). */
  maxDate?: string;
}

/**
 * Kotak tanggal panel catat: "‹ Hari ini, Sab 3 Okt ›". Padanan mobile.
 *
 * Panah pindah sehari. Klik tengahnya untuk kalender sebulan yang menandai
 * hari-hari yang ADA catatannya di panel ini, jadi hari yang lupa diisi
 * kelihatan dari titiknya yang tidak ada. Input date bawaan browser yang
 * dulu dipakai tidak bisa menandai apa pun.
 */
export const DateNav = ({ value, onChange, section, label, maxDate }: DateNavProps) => {
  const batas = maxDate ?? todayWIB();
  const [buka, setBuka] = useState(false);

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

        <button type="button" className="datenav-tengah" onClick={() => setBuka(true)}>
          <CalendarBlankIcon size={18} weight="duotone" />
          <span className="t-label">{navDateLabel(value)}</span>
        </button>

        <button
          type="button"
          className="datenav-panah"
          onClick={() => onChange(shiftDays(value, 1))}
          disabled={value >= batas}
          aria-label="Sehari sesudahnya"
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>

      <CalendarModal
        open={buka}
        onClose={() => setBuka(false)}
        value={value}
        maxDate={batas}
        section={section}
        onSelect={(tanggal) => {
          onChange(tanggal);
          setBuka(false);
        }}
      />
    </div>
  );
};
