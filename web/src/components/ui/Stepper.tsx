import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import './Stepper.css';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
  label?: string;
}

/**
 * Pemilih angka yang bisa DIKETIK, bukan cuma ditambah-kurang.
 *
 * Mengetik langsung wajib ada: menaikkan berat badan dari 0 ke 85 dengan
 * tombol plus itu ratusan ketukan.
 *
 * Nilainya dikirim ke atas pada SETIAP ketikan, bukan cuma saat blur. Versi
 * yang menunggu blur pernah dipakai di mobile dan jadi jebakan: user mengetik
 * angka lalu langsung menekan Simpan, tombol Simpan mengambil fokus tanpa
 * memicu blur pada waktunya, dan yang tersimpan adalah nilai lama, nol.
 *
 * Batas bawah sengaja TIDAK diterapkan saat mengetik. Kalau diterapkan, "8"
 * yang sedang dalam perjalanan menuju "85" akan langsung dilompatkan ke batas
 * minimum dan angkanya mustahil diketik. Batas bawah baru ditegakkan saat blur.
 */
export const Stepper = ({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 1000,
  decimals = 0,
  suffix,
  label,
}: StepperProps) => {
  const [teks, setTeks] = useState(String(value));
  const [nilaiTerakhir, setNilaiTerakhir] = useState(value);

  /**
   * Menyelaraskan teks ketika nilainya berubah DARI LUAR, misalnya saat data
   * server tiba setelah komponen ini sempat dirender.
   *
   * Disesuaikan saat render, bukan di dalam useEffect. Effect akan menjalankan
   * render kedua setiap kali angkanya berubah, dan karena komponen ini memanggil
   * onChange pada setiap ketikan, itu berarti satu render tambahan per huruf.
   * Ini pola resmi React untuk menyesuaikan state ketika prop berubah.
   *
   * Perbandingan `Number(teks) !== value` yang menjaga ketikan setengah jadi:
   * tanpa itu, "85." yang sedang dalam perjalanan menuju "85.5" akan langsung
   * ditimpa jadi "85" dan titiknya mustahil diketik.
   */
  if (value !== nilaiTerakhir) {
    setNilaiTerakhir(value);
    if (Number(teks) !== value) setTeks(String(value));
  }

  const geser = (arah: number) => {
    const berikut = Number(Math.min(Math.max(value + arah * step, min), max).toFixed(decimals));
    setTeks(String(berikut));
    onChange(berikut);
  };

  const ketik = (masuk: string) => {
    // Koma diterima karena papan ketik Indonesia memakainya sebagai desimal.
    const bersih = masuk.replace(',', '.').replace(/[^0-9.]/g, '');
    const bagian = bersih.split('.');
    const hasil = bagian.length > 2 ? bagian[0] + '.' + bagian.slice(1).join('') : bersih;

    setTeks(hasil);

    const angka = Number(hasil);
    if (hasil.trim() !== '' && Number.isFinite(angka)) {
      onChange(Number(Math.min(angka, max).toFixed(decimals)));
    }
  };

  const selesai = () => {
    const angka = Number(teks);
    const akhir = Number(
      (teks.trim() === '' || !Number.isFinite(angka)
        ? min
        : Math.min(Math.max(angka, min), max)
      ).toFixed(decimals),
    );

    setTeks(String(akhir));
    onChange(akhir);
  };

  return (
    <div className="stepper-wrap">
      {label ? <span className="t-label c-secondary">{label}</span> : null}

      <div className="stepper">
        <button
          type="button"
          onClick={() => geser(-1)}
          disabled={value <= min}
          className="stepper-btn"
          aria-label="Kurangi"
        >
          <MinusIcon size={16} weight="bold" />
        </button>

        <div className="stepper-value">
          <input
            className="stepper-input"
            inputMode="decimal"
            value={teks}
            onChange={(e) => ketik(e.target.value)}
            onBlur={selesai}
            aria-label={label ?? 'Nilai'}
          />
          {suffix ? <span className="t-caption c-tertiary">{suffix}</span> : null}
        </div>

        <button
          type="button"
          onClick={() => geser(1)}
          disabled={value >= max}
          className="stepper-btn"
          aria-label="Tambah"
        >
          <PlusIcon size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
};
