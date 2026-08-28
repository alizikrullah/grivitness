import { ImageBrokenIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Skeleton } from '@/components/ui';
import { colors } from '@/constants/colors';
import { fetchImageObjectUrl } from '@/lib/api';

interface AuthImageProps {
  /** Jalur relatif dari backend, misalnya /api/files/{id}. */
  path: string | null | undefined;
  alt: string;
  height?: number;
  className?: string;
}

/**
 * Gambar dari endpoint yang butuh header Authorization.
 *
 * Ini masalah khas web yang tidak ada di mobile. Berkas di Directus bersifat
 * privat, jadi backend menyajikannya lewat proxy ber-autentikasi, tanpa header
 * itu, permintaannya dibalas 401. Tag <img> tidak bisa membawa header apa pun,
 * jadi gambarnya diambil lewat fetch lalu ditukar jadi object URL.
 *
 * Object URL WAJIB dilepas saat komponen dibongkar. Kalau tidak, setiap foto
 * yang pernah dibuka menetap di memori sampai tab ditutup, dan di halaman
 * riwayat yang penuh foto badan, itu menumpuk cepat.
 */
export const AuthImage = ({ path, alt, height = 220, className }: AuthImageProps) => {
  /**
   * Ketiganya disimpan sebagai SATU state supaya jalur yang sedang dimuat
   * selalu menyatu dengan hasilnya. Kalau dipisah, gambar lama masih terpasang
   * sepersekian detik ketika `path` berganti, dan di halaman riwayat foto
   * badan, itu berarti foto hari lain sempat tampil di bawah tanggal yang salah.
   */
  const [state, setState] = useState<{ path: string | null; src: string | null; gagal: boolean }>({
    path: path ?? null,
    src: null,
    gagal: false,
  });

  // Disesuaikan saat render, bukan lewat setState di dalam effect, effect akan
  // menambah satu render lagi setiap kali jalurnya berubah.
  if (state.path !== (path ?? null)) {
    setState({ path: path ?? null, src: null, gagal: false });
  }

  const { src, gagal } = state;

  useEffect(() => {
    if (!path) return;

    let dibatalkan = false;
    let objectUrl: string | null = null;

    fetchImageObjectUrl(path)
      .then((url) => {
        objectUrl = url;

        // Komponen sudah dibongkar sebelum gambarnya tiba: lepaskan langsung,
        // karena tidak akan ada yang membersihkannya nanti.
        if (dibatalkan) {
          URL.revokeObjectURL(url);
          return;
        }

        setState({ path, src: url, gagal: false });
      })
      .catch(() => {
        if (!dibatalkan) setState({ path, src: null, gagal: true });
      });

    return () => {
      dibatalkan = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!path || gagal) {
    return (
      <div
        className={className}
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          background: colors.surfaceAlt,
        }}
      >
        <ImageBrokenIcon size={24} color={colors.textTertiary} weight="duotone" />
      </div>
    );
  }

  if (!src) return <Skeleton height={height} />;

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ height, width: '100%', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
    />
  );
};
