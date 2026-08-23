import type { ReactNode } from 'react';

import './Card.css';

interface CardProps {
  children: ReactNode;
  variant?: 'solid' | 'outline';
  padding?: 'md' | 'lg';
  /** Diisi berarti kartunya bisa diklik — dirender sebagai <button>, bukan <div>. */
  onClick?: () => void;
  className?: string;
}

/**
 * Wadah dasar seluruh aplikasi.
 *
 * Kartu yang bisa diklik dirender sebagai <button>, bukan <div onClick>. Div
 * yang diberi handler klik tidak bisa dicapai lewat Tab dan tidak merespons
 * Enter atau Spasi — pembaca layar pun tidak mengumumkannya sebagai sesuatu
 * yang bisa ditekan.
 */
export const Card = ({
  children,
  variant = 'solid',
  padding = 'lg',
  onClick,
  className = '',
}: CardProps) => {
  const kelas = ['card', 'card-' + variant, 'card-pad-' + padding, className].join(' ');

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={kelas + ' card-clickable'}>
        {children}
      </button>
    );
  }

  return <div className={kelas}>{children}</div>;
};
