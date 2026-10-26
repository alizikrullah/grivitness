import { useState } from 'react';

import { Button, Calendar, Modal } from '@/components/ui';
import { useCalendarDays } from '@/services/misc.service';
import type { CalendarSection } from '@/types';
import { monthEnd, monthStart, todayWIB } from '@/utils/date';
import './CalendarModal.css';

/** Apa yang ditandai titik hijau di tiap panel, untuk keterangan di bawah kalender. */
const ISI: Record<CalendarSection, string> = {
  food: 'Ada catatan makan',
  water: 'Ada catatan minum',
  workout: 'Ada catatan olahraga',
  steps: 'Ada catatan langkah',
  sleep: 'Ada catatan tidur',
  weight: 'Ada catatan berat',
  mood: 'Ada catatan mood',
  'body-photo': 'Ada foto badan atau lingkar pinggang',
  'device-energy': 'Ada angka jam tangan',
  catat: 'Catatan harian lengkap',
};

/** Arti titik kuning, hanya untuk yang memakainya. */
const KUNING: Partial<Record<CalendarSection, string>> = {
  food: 'Ditandai belum lengkap',
  catat: 'Catatan harian belum lengkap',
};

interface CalendarModalProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onSelect: (date: string) => void;
  section: CalendarSection;
  /** Tanggal terjauh yang boleh dipilih, bawaan hari ini. */
  maxDate?: string;
}

/**
 * Kalender sebulan di dalam Modal, dipakai kotak tanggal tiap panel dan header
 * halaman Catat. Padanan CalendarSheet di mobile. Titik hijau berarti ada
 * catatan (di header Catat: catatan harian lengkap), kuning berarti belum
 * lengkap.
 */
export const CalendarModal = ({
  open,
  onClose,
  value,
  onSelect,
  section,
  maxDate,
}: CalendarModalProps) => {
  const hariIni = todayWIB();
  const [bulan, setBulan] = useState(monthStart(value));
  const [terakhirDibuka, setTerakhirDibuka] = useState(open);

  // Setiap kali dibuka, mulai dari bulan tanggal yang sedang dipilih.
  // Disesuaikan saat render, bukan lewat useEffect.
  if (open !== terakhirDibuka) {
    setTerakhirDibuka(open);
    if (open) setBulan(monthStart(value));
  }

  const tanda = useCalendarDays(section, monthStart(bulan), monthEnd(bulan), open);
  const kuning = new Set(tanda.data?.incomplete ?? []);
  const hijau = new Set((tanda.data?.dates ?? []).filter((t) => !kuning.has(t)));
  const keteranganKuning = KUNING[section];

  return (
    <Modal open={open} title="Pilih tanggal" onClose={onClose}>
      <Calendar
        month={bulan}
        selected={value}
        maxDate={maxDate ?? hariIni}
        marked={hijau}
        warned={kuning}
        onSelect={onSelect}
        onMonthChange={setBulan}
      />

      <div className="kalmodal-legend">
        <span className="kalmodal-legend-item t-caption c-secondary">
          <span className="kalmodal-dot kalmodal-dot-hijau" /> {ISI[section]}
        </span>
        {keteranganKuning ? (
          <span className="kalmodal-legend-item t-caption c-secondary">
            <span className="kalmodal-dot kalmodal-dot-kuning" /> {keteranganKuning}
          </span>
        ) : null}
      </div>

      {value === hariIni ? null : (
        <Button
          label="Kembali ke hari ini"
          variant="secondary"
          full
          onClick={() => onSelect(hariIni)}
        />
      )}
    </Modal>
  );
};
