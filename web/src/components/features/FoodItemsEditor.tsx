import { CheckCircleIcon, ClockCounterClockwiseIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { Chip, ConfirmDialog, Input } from '@/components/ui';
import { colors } from '@/constants/colors';
import {
  type FoodItemEditInput,
  useFoodSuggestions,
  useForgetSuggestion,
} from '@/services/food.service';
import type { FoodLabel, FoodSuggestion, FoodUnit } from '@/types';

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
  labelSugar: string;
  /**
   * Baris ini dipilih dari saran "Dari catatanmu". HANYA ini yang membuat
   * backend memakai angka catatan sebelumnya. Dicabut begitu nama atau
   * satuannya diubah: itu makanan lain. Berat dan porsi boleh diubah.
   */
  dariCatatan: boolean;
  /** Saat mengoreksi: urutan item ini di catatan yang tersimpan. */
  sourceIndex?: number;
}

/** Nilai yang tertunda sebentar, supaya tiap ketukan tidak jadi satu permintaan. */
const useTertunda = (nilai: string, ms: number): string => {
  const [tertunda, setTertunda] = useState(nilai);
  useEffect(() => {
    const t = setTimeout(() => setTertunda(nilai), ms);
    return () => clearTimeout(t);
  }, [nilai, ms]);
  return tertunda;
};

const angkaLabel = (n: number | undefined): string => (n ? String(n) : '');

/**
 * Isian dari satu saran: nama, satuan, berat, dan kemasannya kalau ada.
 * Porsi dibiarkan, itu yang berubah tiap kali. Barisnya ditandai dariCatatan
 * supaya backend memakai angka yang sama dengan terakhir kali.
 */
export const dariSaran = (baris: FoodItemDraft, s: FoodSuggestion): FoodItemDraft => ({
  ...baris,
  name: s.name,
  unit: s.unit,
  weight: s.weight_per_portion === null ? '' : String(s.weight_per_portion),
  pakaiKemasan: s.label !== null,
  labelKcal: s.label ? String(s.label.kcal) : '',
  labelProtein: angkaLabel(s.label?.protein_g),
  labelCarbs: angkaLabel(s.label?.carbs_g),
  labelFat: angkaLabel(s.label?.fat_g),
  labelSugar: s.label?.sugar_g === undefined ? '' : String(s.label.sugar_g),
  dariCatatan: true,
});

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
  labelSugar: '',
  dariCatatan: false,
});

/** "Nescafe Classic bubuk · 8 g · 28 kkal": yang dipilih kelihatan sebelum dipilih. */
const labelSaran = (s: FoodSuggestion): string =>
  s.name +
  (s.weight_per_portion ? ' · ' + s.weight_per_portion + ' ' + s.unit : '') +
  (s.kcal_per_portion === null || s.kcal_per_portion === undefined
    ? ''
    : ' · ' + s.kcal_per_portion + ' kkal');

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

  /** Nama atau satuan yang berubah mencabut tanda "dari catatan": itu makanan lain. */
  const ubahIdentitas = (i: number, bagian: Pick<Partial<FoodItemDraft>, 'name' | 'unit'>) =>
    ubah(i, { ...bagian, dariCatatan: false });

  /**
   * Baris yang sedang diketik namanya. Saran cuma tampil untuk baris itu dan
   * hilang begitu satu saran dipilih. Kata pencariannya ditunda sebentar.
   */
  const [aktif, setAktif] = useState<number | null>(null);
  const kataCari = useTertunda(aktif === null ? '' : (items[aktif]?.name ?? ''), 250);
  const saran = useFoodSuggestions(kataCari);
  const lupakan = useForgetSuggestion();
  const [akanDilupakan, setAkanDilupakan] = useState<FoodSuggestion | null>(null);

  const pilihSaran = (i: number, s: FoodSuggestion) => {
    const baris = items[i];
    if (!baris) return;
    onChange(items.map((item, j) => (j === i ? dariSaran(baris, s) : item)));
    setAktif(null);
  };

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
            onChange={(e) => ubahIdentitas(i, { name: e.target.value })}
            onFocus={() => setAktif(i)}
            placeholder="Nama makanan, mis. ayam goreng tanpa kulit"
            maxLength={120}
            disabled={disabled}
          />

          {item.dariCatatan ? (
            <span className="food-tanda t-caption c-success">
              <CheckCircleIcon size={14} weight="fill" />
              Dari catatanmu: angkanya sama dengan terakhir kali. Ubah nama atau satuan berarti
              makanan lain.
            </span>
          ) : null}

          {/*
            Saran dari catatan sendiri. Sekali klik nama, satuan, berat, dan
            kemasannya terisi, dan backend memakai angka yang sama dengan
            terakhir kali. Tombol x di sampingnya untuk Lupakan.
          */}
          {aktif === i && (saran.data?.length ?? 0) > 0 ? (
            <div className="food-saran">
              <span className="food-saran-judul t-caption c-tertiary">
                <ClockCounterClockwiseIcon size={12} weight="bold" /> Dari catatanmu
              </span>
              <div className="chip-group">
                {saran.data?.map((s) => (
                  <span key={s.name + s.unit} className="food-saran-item">
                    <Chip label={labelSaran(s)} onClick={() => pilihSaran(i, s)} />
                    <button
                      type="button"
                      className="food-saran-lupa"
                      title="Lupakan"
                      aria-label={'Lupakan ' + s.name}
                      onClick={() => setAkanDilupakan(s)}
                    >
                      <XIcon size={12} weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

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
                  beratWajib && !item.pakaiKemasan && !item.dariCatatan
                    ? 'Berat per porsi'
                    : 'Berat per porsi (opsional)'
                }
                inputMode="decimal"
                value={item.weight}
                onChange={(e) => ubah(i, { weight: e.target.value })}
                placeholder={
                  item.dariCatatan
                    ? 'Dari catatan'
                    : beratWajib && !item.pakaiKemasan
                      ? '150'
                      : item.pakaiKemasan
                        ? ''
                        : 'AI menaksir'
                }
                suffix={item.unit}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Dua chip satuan, bukan dropdown. Chip ketiga membuka isian dari kemasan. */}
          <div className="chip-group">
            <Chip
              label="gram"
              active={item.unit === 'g'}
              onClick={() => (item.unit === 'g' ? undefined : ubahIdentitas(i, { unit: 'g' }))}
            />
            <Chip
              label="ml"
              active={item.unit === 'ml'}
              onClick={() => (item.unit === 'ml' ? undefined : ubahIdentitas(i, { unit: 'ml' }))}
            />
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
              <div className="food-kemasan-makro">
                <Input
                  label="Lemak"
                  inputMode="decimal"
                  value={item.labelFat}
                  onChange={(e) => ubah(i, { labelFat: e.target.value })}
                  placeholder="0"
                  suffix="g"
                  disabled={disabled}
                />
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
                  label="Gula"
                  inputMode="decimal"
                  value={item.labelSugar}
                  onChange={(e) => ubah(i, { labelSugar: e.target.value })}
                  placeholder="0"
                  suffix="g"
                  disabled={disabled}
                />
              </div>
              <span className="t-caption c-tertiary">
                Angka untuk satu porsi, persis seperti di kemasan. Jumlah porsinya dikalikan
                otomatis. Makro boleh dikosongkan; gula yang kosong ditaksir AI.
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

      <ConfirmDialog
        open={akanDilupakan !== null}
        title={'Lupakan ' + (akanDilupakan?.name ?? '') + '?'}
        message="Nama ini hilang dari saran, dan angka catatan lamanya tidak dipakai lagi. Catatan lamanya sendiri tidak dihapus. Kalau dicatat lagi, angkanya ditaksir dari awal."
        confirmLabel="Lupakan"
        onCancel={() => setAkanDilupakan(null)}
        onConfirm={() => {
          if (akanDilupakan) {
            lupakan.mutate({ name: akanDilupakan.name, unit: akanDilupakan.unit });
            onChange(
              items.map((it) =>
                it.dariCatatan && it.name === akanDilupakan.name && it.unit === akanDilupakan.unit
                  ? { ...it, dariCatatan: false }
                  : it,
              ),
            );
          }
          setAkanDilupakan(null);
        }}
      />
    </div>
  );
};

/**
 * Kalori kemasan yang tidak cocok dengan makronya sendiri, cermin pemeriksaan
 * backend (labelTidakCocok di utils/food-math.ts). Salinan dari mobile.
 */
export const kemasanJanggal = (label: FoodLabel): boolean => {
  const { protein_g: p, carbs_g: c, fat_g: f } = label;
  if (p === undefined && c === undefined && f === undefined) return false;

  const dariMakro = 4 * (p ?? 0) + 4 * (c ?? 0) + 9 * (f ?? 0);
  const toleransi = Math.max(15, 0.2 * Math.max(label.kcal, dariMakro));
  const lengkap = p !== undefined && c !== undefined && f !== undefined;

  return lengkap
    ? Math.abs(label.kcal - dariMakro) > toleransi
    : dariMakro - label.kcal > toleransi;
};

/**
 * Mengubah isian mentah jadi bentuk yang dikirim ke backend. Salinan dari
 * mobile, pemeriksaannya sama dengan backend supaya pesannya muncul sebelum
 * request dikirim. Kemasan yang angkanya janggal dikembalikan sebagai
 * peringatan, bukan penolakan: layar menanyakan "Simpan tetap".
 */
export const susunItem = (
  items: FoodItemDraft[],
  beratWajib: boolean,
): { error: string } | { items: FoodItemEditInput[]; janggal: string[] } => {
  const hasil: FoodItemEditInput[] = [];
  const janggal: string[] = [];

  for (const [i, item] of items.entries()) {
    const nama = item.name.trim();
    if (nama === '') return { error: `Isi nama makanan ${i + 1}` };

    const porsi = Number(item.portions.replace(',', '.'));
    if (!Number.isFinite(porsi) || porsi <= 0) {
      return { error: `Jumlah porsi ${nama} harus lebih dari nol` };
    }

    // Angka kemasan, per satu porsi. Kalorinya wajib kalau bagiannya dibuka.
    let label: FoodLabel | undefined;

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

      const protein = makro(item.labelProtein);
      const karbo = makro(item.labelCarbs);
      const lemak = makro(item.labelFat);
      const gula = makro(item.labelSugar);

      if (gula !== undefined && karbo !== undefined && gula > karbo) {
        return { error: `Gula ${nama} tidak mungkin lebih besar dari karbohidratnya` };
      }

      label = {
        kcal,
        ...(protein === undefined ? {} : { protein_g: protein }),
        ...(karbo === undefined ? {} : { carbs_g: karbo }),
        ...(lemak === undefined ? {} : { fat_g: lemak }),
        ...(gula === undefined ? {} : { sugar_g: gula }),
      };

      if (kemasanJanggal(label)) janggal.push(nama);
    }

    const beratTeks = item.weight.trim().replace(',', '.');
    let weight: number | undefined;

    if (beratTeks !== '') {
      weight = Number(beratTeks);
      if (!Number.isFinite(weight) || weight <= 0) {
        return { error: `Berat ${nama} harus lebih dari nol` };
      }
    } else if (beratWajib && !label && !item.dariCatatan) {
      // Item dari kemasan tidak butuh berat; item dari catatan memakai berat tersimpannya.
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
      ...(item.dariCatatan ? { from_memory: true } : {}),
      ...(item.sourceIndex === undefined ? {} : { source_index: item.sourceIndex }),
    });
  }

  if (hasil.length === 0) return { error: 'Tulis minimal satu makanan' };

  return { items: hasil, janggal };
};
