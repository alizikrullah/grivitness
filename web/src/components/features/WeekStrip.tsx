import { CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';

import { dayLabel, monthTitle, shiftDays, todayWIB, weekdayMon } from '@/utils/date';
import './WeekStrip.css';

interface WeekStripProps {
  value: string;
  onChange: (date: string) => void;
  onOpenCalendar: () => void;
  /** Hari yang catatan hariannya lengkap: titik hijau. */
  complete: ReadonlySet<string>;
  /** Hari yang ada catatannya tapi belum lengkap: titik kuning. */
  partial: ReadonlySet<string>;
}

/**
 * Strip sepekan (Senin sampai Minggu) di header halaman Catat. Padanan mobile.
 *
 * Tiap hari bertitik: hijau kalau catatan hariannya lengkap, kuning kalau baru
 * sebagian, kosong kalau tidak ada catatan sama sekali. Jadi hari yang
 * terlewat kelihatan tanpa membuka harinya satu per satu. Panah pindah pekan,
 * judul bulannya membuka kalender sebulan.
 *
 * Hari terpilih memakai pil terang, bukan merah: merah di halaman ini sudah
 * dipakai menu aktif dan tombol simpan.
 */
export const WeekStrip = ({
  value,
  onChange,
  onOpenCalendar,
  complete,
  partial,
}: WeekStripProps) => {
  const hariIni = todayWIB();
  const senin = shiftDays(value, -weekdayMon(value));
  const hari = Array.from({ length: 7 }, (_, i) => shiftDays(senin, i));
  const bisaMaju = shiftDays(senin, 7) <= hariIni;

  // Pindah pekan memindah tanggal terpilih ke hari yang sama pekan itu,
  // ditahan di hari ini supaya tidak pernah memilih hari yang belum terjadi.
  const pindahPekan = (arah: number) => {
    const tujuan = shiftDays(value, arah * 7);
    onChange(tujuan > hariIni ? hariIni : tujuan);
  };

  return (
    <div className="pekan">
      <div className="pekan-head">
        <button
          type="button"
          className="pekan-panah"
          onClick={() => pindahPekan(-1)}
          aria-label="Pekan sebelumnya"
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>

        <button
          type="button"
          className="pekan-bulan"
          onClick={onOpenCalendar}
          aria-label="Buka kalender sebulan"
        >
          <CalendarBlankIcon size={16} weight="duotone" />
          <span className="t-label">{monthTitle(value)}</span>
        </button>

        <button
          type="button"
          className="pekan-panah"
          onClick={() => pindahPekan(1)}
          disabled={!bisaMaju}
          aria-label="Pekan sesudahnya"
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>

      <div className="pekan-hari">
        {hari.map((tanggal) => {
          const terpilih = tanggal === value;
          const titik = complete.has(tanggal)
            ? ' pekan-titik-hijau'
            : partial.has(tanggal)
              ? ' pekan-titik-kuning'
              : '';

          return (
            <button
              key={tanggal}
              type="button"
              disabled={tanggal > hariIni}
              onClick={() => onChange(tanggal)}
              className={
                'pekan-tanggal' +
                (terpilih ? ' pekan-dipilih' : '') +
                (tanggal === hariIni && !terpilih ? ' pekan-hari-ini' : '')
              }
              aria-pressed={terpilih}
              aria-label={tanggal}
            >
              <span className="t-caption pekan-nama">{dayLabel(tanggal)}</span>
              <span className="t-h3">{String(Number(tanggal.slice(8)))}</span>
              <span className={'pekan-titik' + titik} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
