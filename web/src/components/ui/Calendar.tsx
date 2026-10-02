import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

import { monthEnd, monthStart, monthTitle, shiftMonths, todayWIB, weekdayMon } from '@/utils/date';
import './Calendar.css';

interface CalendarProps {
  /** Bulan yang ditampilkan: tanggal mana pun di bulan itu. */
  month: string;
  selected: string;
  /** Tanggal paling akhir yang boleh dipilih, biasanya hari ini. */
  maxDate: string;
  /** Tanggal bertitik hijau: ada catatan. */
  marked?: ReadonlySet<string>;
  /** Tanggal bertitik kuning: ada catatan tapi ditandai belum lengkap. */
  warned?: ReadonlySet<string>;
  onSelect: (date: string) => void;
  onMonthChange: (month: string) => void;
}

const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/**
 * Kalender sebulan bertema GriviTness, padanan komponen mobile. Gelap,
 * tanggal terpilih merah, titik hijau di hari yang ada catatannya, kuning di
 * hari yang ditandai belum lengkap. Tanggal masa depan tidak bisa dipilih.
 *
 * Menggantikan input date bawaan browser: kalender bawaan tidak bisa menandai
 * hari mana yang sudah dicatat, padahal itu yang dicari.
 */
export const Calendar = ({
  month,
  selected,
  maxDate,
  marked,
  warned,
  onSelect,
  onMonthChange,
}: CalendarProps) => {
  const awal = monthStart(month);
  const jumlahHari = Number(monthEnd(month).slice(8, 10));
  const hariIni = todayWIB();
  const bisaMaju = awal < monthStart(maxDate);

  const sel: (string | null)[] = [
    ...Array.from({ length: weekdayMon(awal) }, () => null),
    ...Array.from(
      { length: jumlahHari },
      (_, i) => awal.slice(0, 8) + String(i + 1).padStart(2, '0'),
    ),
  ];
  while (sel.length % 7 !== 0) sel.push(null);

  return (
    <div className="kalender">
      <div className="kalender-head">
        <button
          type="button"
          className="kalender-nav"
          onClick={() => onMonthChange(shiftMonths(awal, -1))}
          aria-label="Bulan sebelumnya"
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>
        <span className="t-h3">{monthTitle(awal)}</span>
        <button
          type="button"
          className="kalender-nav"
          onClick={() => onMonthChange(shiftMonths(awal, 1))}
          disabled={!bisaMaju}
          aria-label="Bulan berikutnya"
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>

      <div className="kalender-grid">
        {HARI.map((h) => (
          <span key={h} className="kalender-hari t-caption c-tertiary">
            {h}
          </span>
        ))}

        {sel.map((tanggal, i) => {
          if (tanggal === null) return <span key={'k' + String(i)} />;

          const nanti = tanggal > maxDate;
          const dipilih = tanggal === selected;
          const titik = warned?.has(tanggal)
            ? 'kalender-titik-kuning'
            : marked?.has(tanggal)
              ? 'kalender-titik-hijau'
              : '';

          return (
            <button
              key={tanggal}
              type="button"
              disabled={nanti}
              onClick={() => onSelect(tanggal)}
              aria-pressed={dipilih}
              aria-label={tanggal}
              className={[
                'kalender-tanggal',
                dipilih ? 'kalender-dipilih' : '',
                !dipilih && tanggal === hariIni ? 'kalender-hari-ini' : '',
              ].join(' ')}
            >
              <span>{Number(tanggal.slice(8, 10))}</span>
              <span className={'kalender-titik ' + titik} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
