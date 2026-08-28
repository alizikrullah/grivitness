import { EnvelopeIcon, LockIcon, UserIcon } from '@phosphor-icons/react';
import { type FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import logoMark from '@/assets/logo-mark.png';
import { Button, ErrorNote, Input } from '@/components/ui';
import { colors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import './AuthPage.css';

interface AuthPageProps {
  mode: 'login' | 'register';
}

/**
 * Satu komponen untuk masuk dan daftar.
 *
 * Keduanya berbagi tata letak, validasi, dan penanganan error yang sama persis, * memisahkannya jadi dua berkas berarti dua salinan yang harus dijaga selaras,
 * dan yang terlewat akan tampak sebagai dua halaman yang anehnya berbeda.
 */
export const AuthPage = ({ mode }: AuthPageProps) => {
  const navigate = useNavigate();

  const status = useAuthStore((s) => s.status);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [memproses, setMemproses] = useState(false);

  const daftar = mode === 'register';

  // User yang sudah masuk tidak punya urusan di halaman ini.
  if (status === 'authenticated') return <Navigate to="/" replace />;

  const kirim = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (daftar && nama.trim().length < 2) {
      setError('Nama minimal 2 huruf');
      return;
    }

    if (!email.includes('@')) {
      setError('Email tidak valid');
      return;
    }

    if (sandi.length < 8) {
      setError('Kata sandi minimal 8 karakter');
      return;
    }

    setMemproses(true);

    const jalan = daftar ? register(nama.trim(), email.trim(), sandi) : login(email.trim(), sandi);

    jalan
      .then(() => navigate('/', { replace: true }))
      .catch((e: unknown) => setError(toApiError(e).message))
      .finally(() => setMemproses(false));
  };

  return (
    <div className="auth">
      <div className="auth-panel">
        <div className="auth-brand">
          <img src={logoMark} alt="" className="auth-mark" />
          <span className="t-h2">GriviTness</span>
        </div>

        {/* Judul besar dengan satu kata di dalam pil merah, elemen khas yang
            diambil dari referensi visual, sama seperti HeroTitle di mobile. */}
        <h1 className="t-display auth-title">
          {daftar ? 'Mulai ' : 'Lanjutkan '}
          <span className="auth-pill">{daftar ? 'sekarang' : 'progresmu'}</span>
        </h1>

        <p className="t-body c-secondary">
          {daftar
            ? 'Buat akun untuk mulai memantau berat, makan, dan olahragamu.'
            : 'Masuk untuk melihat catatan dan targetmu.'}
        </p>

        <form onSubmit={kirim} className="stack auth-form">
          {daftar ? (
            <Input
              label="Nama"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama kamu"
              autoComplete="name"
              icon={<UserIcon size={16} color={colors.textSecondary} />}
            />
          ) : null}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@email.com"
            autoComplete="email"
            icon={<EnvelopeIcon size={16} color={colors.textSecondary} />}
          />

          <Input
            label="Kata sandi"
            type="password"
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            placeholder="Minimal 8 karakter"
            // Memberi tahu pengelola kata sandi apakah ini sandi baru atau
            // lama. Tanpa ini, sandi baru sering tidak ditawarkan untuk disimpan.
            autoComplete={daftar ? 'new-password' : 'current-password'}
            icon={<LockIcon size={16} color={colors.textSecondary} />}
          />

          {error ? <ErrorNote message={error} /> : null}

          <Button
            type="submit"
            label={daftar ? 'Daftar' : 'Masuk'}
            size="lg"
            full
            loading={memproses}
          />
        </form>

        <p className="t-caption c-secondary auth-switch">
          {daftar ? 'Sudah punya akun? ' : 'Belum punya akun? '}
          <Link to={daftar ? '/login' : '/register'} className="auth-link">
            {daftar ? 'Masuk' : 'Daftar'}
          </Link>
        </p>
      </div>
    </div>
  );
};
