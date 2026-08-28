import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { ProgressBar } from '@/components/ui';
import './MetricTile.css';

interface MetricTileProps {
  icon: ReactNode;
  label: string;
  value: string;
  /** Keterangan kecil di samping nilai, misalnya "dari 8.000". */
  unit?: string;
  progress?: number;
  color: string;
  to?: string;
}

export const MetricTile = ({ icon, label, value, unit, progress, color, to }: MetricTileProps) => {
  const navigate = useNavigate();

  const isi = (
    <>
      <div className="tile-head">
        <span className="tile-icon">{icon}</span>
        <span className="t-caption c-secondary truncate">{label}</span>
      </div>

      <div className="tile-value">
        <span className="t-h2">{value}</span>
        {unit ? <span className="t-caption c-tertiary">{unit}</span> : null}
      </div>

      {progress === undefined ? null : <ProgressBar progress={progress} color={color} />}
    </>
  );

  if (!to) return <div className="tile">{isi}</div>;

  return (
    <button
      type="button"
      className="tile tile-clickable"
      // navigate() mengembalikan Promise di React Router 7. Dibuang eksplisit
      // dengan void, karena handler onClick tidak menunggunya dan penolakan
      // yang tidak tertangani akan hilang diam-diam.
      onClick={() => void navigate(to)}
    >
      {isi}
    </button>
  );
};
