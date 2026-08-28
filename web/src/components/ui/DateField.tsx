import { useId } from 'react';

import { isToday, longDate, todayWIB } from '@/utils/date';
import './DateField.css';

interface DateFieldProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
}

/**
 * Pemilih tanggal untuk panel pencatatan.
 *
 * Sengaja memakai input date bawaan browser, bukan strip tanggal mendatar
 * seperti di mobile. Di layar lebar, kalender bawaan lebih ringkas, bisa
 * dijangkau lewat papan ketik, dan sanggup melompat berbulan-bulan ke belakang
 * tanpa menggulir. Strip mendatar dipakai di mobile justru karena sentuhan di
 * layar sempit lebih cocok dengan gulir daripada dengan kalender kecil.
 *
 * Tanggal masa depan tidak ditawarkan. Mencatat berat badan besok tidak masuk
 * akal, dan backend akan menolaknya.
 */
export const DateField = ({ value, onChange, label = 'Tanggal' }: DateFieldProps) => {
  const id = useId();

  return (
    <div className="datefield">
      <label className="t-caption c-secondary" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        type="date"
        className="datefield-input"
        value={value}
        max={todayWIB()}
        onChange={(e) => onChange(e.target.value)}
      />

      <span className="t-caption c-tertiary">{longDate(value)}</span>

      {/* Jalan pulang yang jelas. Tanpa ini, user yang menelusuri jauh ke
          belakang harus mengingat sendiri tanggal hari ini untuk kembali. */}
      {isToday(value) ? null : (
        <button type="button" className="datefield-reset" onClick={() => onChange(todayWIB())}>
          Kembali ke hari ini
        </button>
      )}
    </div>
  );
};
