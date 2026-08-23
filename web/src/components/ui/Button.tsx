import type { ButtonHTMLAttributes, ReactNode } from 'react';

import './Button.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}

export const Button = ({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  full = false,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    // Tombol yang sedang memuat tetap dinonaktifkan, supaya satu ketukan ganda
    // tidak mengirim dua permintaan — untuk collection harian, yang kedua akan
    // ditolak DUPLICATE_ENTRY dan user melihat error yang membingungkan.
    disabled={disabled === true || loading}
    aria-busy={loading}
    className={['btn', 'btn-' + variant, 'btn-' + size, full ? 'btn-full' : ''].join(' ')}
    {...rest}
  >
    {loading ? <span className="btn-spinner" aria-hidden /> : icon}
    <span>{label}</span>
  </button>
);
