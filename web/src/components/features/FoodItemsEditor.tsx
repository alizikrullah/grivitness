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
  /** Bagian "dari kemasan" dibuka user. Isinya per SATU porsi. */
  pakaiKemasan: boolean;
  labelKcal: string;
  labelProtein: string;
  labelCarbs: string;
  labelFat: string;
}

export const barisKosong = (): FoodItemDraft => ({
  name: '',
  portions: '1',
  weight: '',
  unit: 'g',
  pakaiKemasan: false,
  labelKcal: '',
  labelProtein: '',
  labelCarbs: '',
  labelFat: '',
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
                label={
                  beratWajib && !item.pakaiKemasan
                    ? 'Berat per porsi'
                    : 'Berat per porsi (opsional)'
                }
                inputMode="decimal"
                value={item.weight}
                onChange={(e) => ubah(i, { weight: e.target.value })}
                placeholder={
                  beratWajib && !item.pakaiKemasan ? '150' : item.pakaiKemasan ? '' : 'AI menaksir'
                }
                suffix={item.unit}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Dua chip satuan, bukan dropdown. Chip ketiga membuka isian dari kemasan. */}
          <div className="chip-group">
            <Chip label="gram" active={item.unit === 'g'} onClick={() => ubah(i, { unit: 'g' })} />
            <Chip label="ml" active={item.unit === 'ml'} onClick={() => ubah(i, { unit: 'ml' })} />
            <Chip
              label={item.pakaiKemasan ? 'Dari kemasan ✓' : 'Dari kemasan'}
              active={item.pakaiKemasan}
              onClick={() => ubah(i, { pakaiKemasan: !item.pakaiKemasan })}
            />
          </div>

          {/*
            Angka kemasan menang mutlak atas taksiran AI. Diisi PER SATU porsi,
            backend yang mengalikan dengan jumlah porsi.
          */}
          {item.pakaiKemasan ? (
            <div className="food-kemasan">
              <Input
                label="Kalori per porsi (dari kemasan)"
                inputMode="decimal"
                value={item.labelKcal}
                onChange={(e) => ubah(i, { labelKcal: e.target.value })}
                placeholder="350"
                suffix="kkal"
                disabled={disabled}
              />
              <div className="grid-3">
                <Input
                  label="Protein"
                  inputMode="decimal"
                  value={item.labelProtein}
                  onChange={(e) => ubah(i, { labelProtein: e.target.value })}
                  placeholder="0"
                  suffix="g"
                  disabled={disabled}
                />
                <Input
                  label="Karbo"
                  inputMode="decimal"
                  value={item.labelCarbs}
                  onChange={(e) => ubah(i, { labelCarbs: e.target.value })}
                  placeholder="0"
                  suffix="g"
                  disabled={disabled}
                />
                <Input
                  label="Lemak"
                  inputMode="decimal"
                  value={item.labelFat}
                  onChange={(e) => ubah(i, { labelFat: e.target.value })}
                  placeholder="0"
                  suffix="g"
                  disabled={disabled}
                />
              </div>
              <span className="t-caption c-tertiary">
                Angka untuk satu porsi, persis seperti di kemasan. Jumlah porsinya dikalikan
                otomatis. Makro boleh dikosongkan.
              </span>
            </div>
          ) : null}
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

    // Angka kemasan, per satu porsi. Kalorinya wajib kalau bagiannya dibuka.
    let label: FoodItemInput['label'];

    if (item.pakaiKemasan) {
      const kcal = Number(item.labelKcal.trim().replace(',', '.'));
      if (item.labelKcal.trim() === '' || !Number.isFinite(kcal) || kcal < 0) {
        return { error: `Isi kalori per porsi ${nama} dari kemasannya` };
      }

      const makro = (teks: string): number | undefined => {
        const bersih = teks.trim().replace(',', '.');
        if (bersih === '') return undefined;
        const n = Number(bersih);
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };

      label = {
        kcal,
        ...(makro(item.labelProtein) === undefined ? {} : { protein_g: makro(item.labelProtein) }),
        ...(makro(item.labelCarbs) === undefined ? {} : { carbs_g: makro(item.labelCarbs) }),
        ...(makro(item.labelFat) === undefined ? {} : { fat_g: makro(item.labelFat) }),
      };
    }

    const beratTeks = item.weight.trim().replace(',', '.');
    let weight: number | undefined;

    if (beratTeks !== '') {
      weight = Number(beratTeks);
      if (!Number.isFinite(weight) || weight <= 0) {
        return { error: `Berat ${nama} harus lebih dari nol` };
      }
    } else if (beratWajib && !label) {
      // Item dari kemasan tidak butuh berat: kalorinya sudah per porsi.
      return {
        error: `Isi perkiraan berat ${nama}, atau lampirkan foto supaya ditaksir dari sana`,
      };
    }

    hasil.push({
      name: nama,
      portions: porsi,
      unit: item.unit,
      ...(weight === undefined ? {} : { weight }),
      ...(label === undefined ? {} : { label }),
    });
  }

  if (hasil.length === 0) return { error: 'Tulis minimal satu makanan' };

  return { items: hasil };
};
