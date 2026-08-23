import {
  BarbellIcon,
  ChartLineUpIcon,
  HouseIcon,
  ListIcon,
  SignOutIcon,
  UserIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth.store';
import { greeting, longDate, todayWIB } from '@/utils/date';
import { initials } from '@/utils/format';
import './AppLayout.css';

const MENU = [
  { to: '/', label: 'Beranda', icon: HouseIcon, end: true },
  { to: '/log', label: 'Catat', icon: ListIcon, end: false },
  { to: '/progress', label: 'Progres', icon: ChartLineUpIcon, end: false },
  { to: '/profile', label: 'Profil', icon: UserIcon, end: false },
] as const;

/**
 * Kerangka aplikasi: sidebar tetap di kiri, isi halaman di kanan.
 *
 * Berbeda dari mobile yang memakai tab bar melayang di bawah. Layar desktop
 * punya ruang horizontal berlimpah dan ruang vertikal yang justru terbatas,
 * jadi navigasi ditaruh di sisi — meniru tab bar di bawah akan membuang tinggi
 * layar yang paling dibutuhkan isi.
 */
export const AppLayout = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [menuTerbuka, setMenuTerbuka] = useState(false);

  const keluar = () => {
    if (!confirm('Keluar dari akun? Kamu perlu masuk lagi untuk melihat catatanmu.')) return;

    void logout().then(() => navigate('/login'));
  };

  return (
    <div className="app">
      <aside className={'sidebar' + (menuTerbuka ? ' sidebar-open' : '')}>
        <div className="sidebar-brand">
          <span className="sidebar-mark">G</span>
          <span className="t-h3">GriviTness</span>
        </div>

        <nav className="sidebar-nav">
          {MENU.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMenuTerbuka(false)}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' sidebar-link-active' : '')}
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="sidebar-avatar">{initials(user?.name ?? 'G')}</span>
            <span className="flex-1 truncate">
              <span className="t-label truncate">{user?.name ?? '—'}</span>
              <span className="t-caption c-tertiary truncate">{user?.email ?? ''}</span>
            </span>
          </div>

          <button type="button" onClick={keluar} className="sidebar-logout">
            <SignOutIcon size={18} />
            <span className="t-caption">Keluar</span>
          </button>
        </div>
      </aside>

      {/* Latar gelap yang menutup menu di layar sempit. aria-hidden karena
          tombol tutup yang sesungguhnya sudah ada di header. */}
      {menuTerbuka ? (
        <div className="app-scrim" onClick={() => setMenuTerbuka(false)} aria-hidden />
      ) : null}

      <div className="app-main">
        <header className="app-header">
          <button
            type="button"
            className="app-burger"
            onClick={() => setMenuTerbuka((v) => !v)}
            aria-label={menuTerbuka ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={menuTerbuka}
          >
            <BarbellIcon size={20} weight="duotone" />
          </button>

          <div className="stack-xs">
            <span className="t-caption c-secondary">{greeting()}</span>
            <span className="t-caption c-tertiary">{longDate(todayWIB())}</span>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
