import { CameraIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useMemo } from 'react';

import { colors } from '@/constants/colors';
import './PhotoPicker.css';

interface PhotoPickerProps {
  label: string;
  file: File | null;
  onPick: (file: File | null) => void;
}

/**
 * Pemilih foto dengan pratinjau.
 *
 * Pratinjaunya penting, bukan hiasan: tanpa itu user tidak punya cara tahu
 * apakah fotonya benar-benar terpilih, dan akan menekan Simpan berulang kali.
 * Ini persis keluhan yang muncul di mobile.
 *
 * Object URL pratinjau dilepas setiap berkasnya berganti — kalau tidak,
 * memilih ulang foto sepuluh kali meninggalkan sepuluh salinan di memori.
 */
export const PhotoPicker = ({ label, file, onPick }: PhotoPickerProps) => {
  /**
   * URL pratinjau diturunkan saat render, bukan disimpan lewat useState di
   * dalam useEffect.
   *
   * Cara effect + setState memaksa render kedua setiap kali foto dipilih, dan
   * di antara keduanya kotaknya sempat tampil kosong padahal berkasnya sudah
   * ada — kedipan yang justru mengaburkan hal yang ingin dipastikan user.
   *
   * Pelepasannya tetap lewat effect, karena hanya di situ ada cleanup.
   */
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!preview) return;

    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="picker">
      <span className="t-label c-secondary">{label}</span>

      <label className="picker-box">
        {preview ? (
          <img src={preview} alt={'Pratinjau ' + label} className="picker-img" />
        ) : (
          <span className="picker-empty">
            <CameraIcon size={26} color={colors.textTertiary} weight="duotone" />
            <span className="t-caption c-tertiary">Pilih foto</span>
          </span>
        )}

        <input
          type="file"
          // capture="environment" membuat ponsel membuka kamera belakang
          // langsung. Di desktop atribut ini diabaikan, jadi aman disertakan.
          accept="image/*"
          capture="environment"
          className="picker-input"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>

      {file ? (
        <button type="button" onClick={() => onPick(null)} className="picker-clear">
          <XIcon size={13} weight="bold" />
          <span className="t-caption">Hapus pilihan</span>
        </button>
      ) : null}
    </div>
  );
};
