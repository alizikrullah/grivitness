import type { ReactNode } from 'react';

import { colors } from '@/constants/colors';
import './Misc.css';

/** Baris label-nilai. Dipakai di kartu profil, rencana, dan rekap. */
export const Row = ({
  label,
  value,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: 'primary' | 'accent' | 'success' | 'secondary';
}) => (
  <div className="misc-row">
    <span className="misc-row-left t-body c-secondary">
      {icon}
      {label}
    </span>
    <span className={'t-label ' + (tone === 'primary' ? '' : 'c-' + tone)}>{value}</span>
  </div>
);

export const SectionHeader = ({ title, action }: { title: string; action?: ReactNode }) => (
  <div className="misc-section">
    <h2 className="t-h3">{title}</h2>
    {action}
  </div>
);

export const Divider = () => <hr className="misc-divider" />;

export const ProgressBar = ({
  progress,
  color = colors.primary,
}: {
  progress: number;
  color?: string;
}) => (
  <div
    className="misc-bar"
    role="progressbar"
    aria-valuenow={Math.round(Math.min(Math.max(progress, 0), 1) * 100)}
    aria-valuemin={0}
    aria-valuemax={100}
  >
    <div
      className="misc-bar-fill"
      style={{ width: Math.min(Math.max(progress, 0), 1) * 100 + '%', background: color }}
    />
  </div>
);

export const StatPill = ({ label, value }: { label: string; value: string }) => (
  <div className="misc-pill">
    <span className="t-overline c-tertiary">{label}</span>
    <span className="t-label">{value}</span>
  </div>
);

export const Loading = ({ label = 'Memuat…' }: { label?: string }) => (
  <div className="misc-center" role="status">
    <span className="misc-spinner" aria-hidden />
    <span className="t-caption c-tertiary">{label}</span>
  </div>
);

export const ErrorNote = ({ message }: { message: string }) => (
  <div className="misc-error" role="alert">
    {message}
  </div>
);

export const EmptyState = ({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) => (
  <div className="misc-empty">
    {icon ? <div className="misc-empty-icon">{icon}</div> : null}
    <span className="t-label">{title}</span>
    {message ? <span className="t-caption c-secondary">{message}</span> : null}
    {action}
  </div>
);

export const Skeleton = ({ height = 20, width = '100%' }: { height?: number; width?: string }) => (
  <div className="misc-skeleton" style={{ height, width }} aria-hidden />
);

/** Lingkaran berisi ikon, dipakai sebagai wadah gelap di depan kartu. */
export const IconCircle = ({
  children,
  size = 40,
  tint,
}: {
  children: ReactNode;
  size?: number;
  tint?: string;
}) => (
  <span
    className="misc-icon-circle"
    style={{ width: size, height: size, background: tint ?? colors.surfaceHigh }}
  >
    {children}
  </span>
);
