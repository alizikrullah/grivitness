import { CheckIcon } from '@phosphor-icons/react';
import { useId } from 'react';

import './Checkbox.css';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Keterangan kecil di bawah label, untuk menjelaskan akibat dicentang. */
  hint?: string;
}

/**
 * Kotak centang untuk satu pertanyaan ya/tidak. Padanan Checkbox di mobile.
 *
 * Berbeda dari sepasang Chip: chip menyiratkan dua pilihan setara, sedangkan
 * kotak centang menyiratkan satu keadaan yang bawaannya mati. Untuk "sesi ini
 * terekam jam tangan?" yang kedua lebih jujur, karena kebanyakan sesi memang
 * tidak terekam dan user cukup mengabaikannya.
 *
 * Input aslinya tetap ada tapi disembunyikan secara visual, bukan dihapus,
 * supaya keyboard dan pembaca layar memperlakukannya sebagai checkbox asli.
 */
export const Checkbox = ({ label, checked, onChange, hint }: CheckboxProps) => {
  const id = useId();

  return (
    <label htmlFor={id} className="checkbox">
      <input
        id={id}
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={'checkbox-box' + (checked ? ' checkbox-box-on' : '')} aria-hidden>
        {checked ? <CheckIcon size={14} color="#fff" weight="bold" /> : null}
      </span>
      <span className="checkbox-text">
        <span className="t-label">{label}</span>
        {hint ? <span className="t-caption c-tertiary">{hint}</span> : null}
      </span>
    </label>
  );
};
