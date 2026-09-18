import {
  BarbellIcon,
  CameraIcon,
  DropIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  ScalesIcon,
  SmileyIcon,
  WatchIcon,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { colors, metricColors } from '@/constants/colors';
import { BodyPhotoPanel } from './BodyPhotoPanel';
import { DeviceEnergyPanel } from './DeviceEnergyPanel';
import { FoodPanel } from './FoodPanel';
import { MoodPanel } from './MoodPanel';
import { SleepPanel } from './SleepPanel';
import { StepsPanel } from './StepsPanel';
import { WaterPanel } from './WaterPanel';
import { WeightPanel } from './WeightPanel';
import { WorkoutPanel } from './WorkoutPanel';
import './LogPage.css';

interface JenisCatat {
  slug: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; weight?: 'duotone' | 'fill' }>;
  color: string;
  Panel: ComponentType;
}

const JENIS: JenisCatat[] = [
  {
    slug: 'weight',
    label: 'Berat',
    icon: ScalesIcon,
    color: metricColors.weight,
    Panel: WeightPanel,
  },
  {
    slug: 'food',
    label: 'Makan',
    icon: ForkKnifeIcon,
    color: metricColors.calories,
    Panel: FoodPanel,
  },
  {
    slug: 'workout',
    label: 'Olahraga',
    icon: BarbellIcon,
    color: metricColors.workout,
    Panel: WorkoutPanel,
  },
  {
    slug: 'steps',
    label: 'Langkah',
    icon: FootprintsIcon,
    color: metricColors.steps,
    Panel: StepsPanel,
  },
  {
    slug: 'device-energy',
    label: 'Kalori jam',
    icon: WatchIcon,
    color: metricColors.device,
    Panel: DeviceEnergyPanel,
  },
  { slug: 'water', label: 'Minum', icon: DropIcon, color: metricColors.water, Panel: WaterPanel },
  {
    slug: 'sleep',
    label: 'Tidur',
    icon: MoonStarsIcon,
    color: metricColors.sleep,
    Panel: SleepPanel,
  },
  { slug: 'mood', label: 'Mood', icon: SmileyIcon, color: metricColors.mood, Panel: MoodPanel },
  // Foto badan dan lingkar pinggang jadi satu panel, irama 2-4 minggu sekali.
  // Panel ukuran badan yang lama (tujuh lingkar) dicabut: tidak dipakai
  // hitungan mana pun dan cuma jadi beban isian.
  {
    slug: 'body-photo',
    label: 'Foto & pinggang',
    icon: CameraIcon,
    color: metricColors.measurements,
    Panel: BodyPhotoPanel,
  },
];

/**
 * Hub pencatatan: daftar jenis di kiri, formulirnya di kanan.
 *
 * Berbeda dari mobile yang memberi satu layar penuh per jenis. Di layar lebar,
 * memaksa user bolak-balik ke halaman hub setiap ganti jenis catatan itu
 * membuang ruang yang justru berlimpah, di sini keduanya muat berdampingan.
 */
export const LogPage = () => (
  <div className="log">
    <nav className="log-nav">
      {JENIS.map(({ slug, label, icon: Icon, color }) => (
        <NavLink
          key={slug}
          to={'/log/' + slug}
          className={({ isActive }) => 'log-nav-item' + (isActive ? ' log-nav-active' : '')}
        >
          <span className="log-nav-icon" style={{ background: color }}>
            <Icon size={18} color={colors.background} weight="fill" />
          </span>
          <span className="t-label">{label}</span>
        </NavLink>
      ))}
    </nav>

    <div className="log-panel">
      <Routes>
        <Route index element={<Navigate to="weight" replace />} />
        {JENIS.map(({ slug, Panel }) => (
          <Route key={slug} path={slug} element={<Panel />} />
        ))}
        {/* Slug yang tidak dikenal dikembalikan ke jenis pertama, bukan
            dibiarkan menampilkan panel kosong tanpa penjelasan. */}
        <Route path="*" element={<Navigate to="/log/weight" replace />} />
      </Routes>
    </div>
  </div>
);
