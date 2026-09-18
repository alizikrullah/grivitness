import { PlusIcon, XIcon } from '@phosphor-icons/react';

import { Chip, Input } from '@/components/ui';
import { colors } from '@/constants/colors';
import type { FoodItemInput } from '@/services/food.service';
import type { FoodUnit } from '@/types';

import './FoodItemsEditor.css';

/**
 * Satu baris isian, semuanya teks mentah. Angkanya baru diubah saat disimpan,
 * supaya user bisa mengetik "0," tanpa langsung ditolak di tengah jalan.
 * Salinan dari mobile.
 */
export interface FoodItemDraft {
  name: string;
  portions: string;
  weight: string;
  unit: FoodUnit;
}

export const barisKosong = (): FoodItemDraft => ({
  name: '',
  portions: '1',
  weight: '',
  unit: 'g',
});

interface FoodItemsEditorProps {
  items: FoodItemDraft[];
  onChange: (items: FoodItemDraft[]) => void;
  /**
   * Berat wajib diisi. Benar saat tidak ada foto (tidak ada yang bisa ditaksir
   * model) dan saat mengoreksi (tidak ada foto yang dianalisa ulang).
   */
  beratWajib: boolean;
  /** Menambah item dimatikan saat mengoreksi: makanan baru adalah sesi baru. */
  bisaTambah?: boolean;
  disabled?: boolean;
}

/**
 * Daftar makanan dalam satu sesi makan, ditulis user. Padanan komponen mobile.
 *
 * Ini pengganti kolom catatan bebas. Catatan bebas gagal karena jumlah porsi
 * di dalam kalimat harus ditafsirkan model, dan model mengabaikannya. Di sini
 * jumlah porsi kolom angka sendiri yang dikalikan backend.
 */
export const FoodItemsEditor = ({
  items,
  onChange,
  beratWajib,
  bisaTambah = true,
  disabled = false,
}: FoodItemsEditorProps) => {
  const ubah = (i: number, bagian: Partial<FoodItemDraft>) =>
    onChange(items.map((item, j) => (j === i ? { ...item, ...bagian } : item)));

  return (
    <div className="food-items">
      {items.map((item, i) => (
        <div key={i} className="food-item">
          <div className="row-between">
            <span className="t-overline c-tertiary">Makanan {i + 1}</span>

            {items.length > 1 ? (
              <button
                type="button"
                className="food-item-hapus"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                disabled={disabled}
                aria-label={'Hapus makanan ' + (i + 1)}
              >
                <XIcon size={14} color={colors.textSecondary} weight="bold" />
              </button>
            ) : null}
          </div>

          <Input
            value={item.name}
            onChange={(e) => ubah(i, { name: e.target.value })}
            placeholder="Nama makanan, mis. ayam goreng tanpa kulit"
            maxLength={120}
            disabled={disabled}
          />

          <div className="food-item-angka">
            <div className="food-item-porsi">
              <Input
                label="Porsi"
                inputMode="decimal"
                value={item.portions}
                onChange={(e) => ubah(i, { portions: e.target.value })}
                placeholder="1"
                disabled={disabled}
              />
            </div>

            <div className="food-item-berat">
              <Input
                label={beratWajib ? 'Berat per porsi' : 'Berat per porsi (opsional)'}
                inputMode="decimal"
                value={item.weight}
                onChange={(e) => ubah(i, { weight: e.target.value })}
                placeholder={beratWajib ? '150' : 'AI menaksir'}
                suffix={item.unit}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Dua chip, bukan dropdown: cuma ada dua pilihan. */}
          <div className="chip-group">
            <Chip label="gram" active={item.unit === 'g'} onClick={() => ubah(i, { unit: 'g' })} />
            <Chip label="ml" active={item.unit === 'ml'} onClick={() => ubah(i, { unit: 'ml' })} />
          </div>
        </div>
      ))}

      {bisaTambah ? (
        <button
          type="button"
          className="food-item-tambah"
          onClick={() => onChange([...items, barisKosong()])}
          disabled={disabled}
        >
          <PlusIcon size={16} weight="bold" />
          Tambah makanan
        </button>
      ) : null}
    </div>
  );
};

/**
 * Mengubah isian mentah jadi bentuk yang dikirim ke backend. Salinan dari
 * mobile, pemeriksaannya sama dengan backend supaya pesannya muncul sebelum
 * request dikirim.
 */
export const susunItem = (
  items: FoodItemDraft[],
  beratWajib: boolean,
): { error: string } | { items: FoodItemInput[] } => {
  const hasil: FoodItemInput[] = [];

  for (const [i, item] of items.entries()) {
    const nama = item.name.trim();
    if (nama === '') return { error: `Isi nama makanan ${i + 1}` };

    const porsi = Number(item.portions.replace(',', '.'));
    if (!Number.isFinite(porsi) || porsi <= 0) {
      return { error: `Jumlah porsi ${nama} harus lebih dari nol` };
    }

    const beratTeks = item.weight.trim().replace(',', '.');
    let weight: number | undefined;

    if (beratTeks !== '') {
      weight = Number(beratTeks);
      if (!Number.isFinite(weight) || weight <= 0) {
        return { error: `Berat ${nama} harus lebih dari nol` };
      }
    } else if (beratWajib) {
      return {
        error: `Isi perkiraan berat ${nama}, atau lampirkan foto supaya ditaksir dari sana`,
      };
    }

    hasil.push({
      name: nama,
      portions: porsi,
      unit: item.unit,
      ...(weight === undefined ? {} : { weight }),
    });
  }

  if (hasil.length === 0) return { error: 'Tulis minimal satu makanan' };

  return { items: hasil };
};
