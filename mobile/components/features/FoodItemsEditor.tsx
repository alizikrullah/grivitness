import * as Haptics from 'expo-haptics';
import { ClockCounterClockwiseIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Input, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { type FoodItemInput, useFoodSuggestions } from '@/services/food.service';
import type { FoodSuggestion, FoodUnit } from '@/types';

/**
 * Satu baris isian, semuanya teks mentah. Angkanya baru diubah saat disimpan,
 * supaya user bisa mengetik "0," tanpa langsung ditolak di tengah jalan.
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

/** Nilai yang tertunda sebentar, supaya tiap ketukan tidak jadi satu permintaan. */
const useTertunda = (nilai: string, ms: number): string => {
  const [tertunda, setTertunda] = useState(nilai);
  useEffect(() => {
    const t = setTimeout(() => setTertunda(nilai), ms);
    return () => clearTimeout(t);
  }, [nilai, ms]);
  return tertunda;
};

/**
 * Isian dari satu saran: nama, satuan, berat, dan kemasannya kalau ada.
 * Porsi dibiarkan, itu yang berubah tiap kali. Untuk item yang gizinya dari
 * taksiran AI, kemasannya tidak dibuka: backend memakai ulang angka yang
 * sama lewat ingatan makanan, jadi tidak ada yang perlu diketik.
 */
export const dariSaran = (baris: FoodItemDraft, s: FoodSuggestion): FoodItemDraft => ({
  ...baris,
  name: s.name,
  unit: s.unit,
  weight: s.weight_per_portion === null ? '' : String(s.weight_per_portion),
  pakaiKemasan: s.label !== null,
  labelKcal: s.label ? String(s.label.kcal) : '',
  labelProtein: s.label?.protein_g ? String(s.label.protein_g) : '',
  labelCarbs: s.label?.carbs_g ? String(s.label.carbs_g) : '',
  labelFat: s.label?.fat_g ? String(s.label.fat_g) : '',
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
 * Daftar makanan dalam satu sesi makan, ditulis user.
 *
 * Ini pengganti kolom catatan bebas. Catatan bebas gagal karena jumlah porsi
 * di dalam kalimat harus ditafsirkan model, dan model mengabaikannya. Di sini
 * jumlah porsi kolom angka sendiri yang dikalikan backend, dan tidak ada yang
 * bisa mengabaikannya.
 *
 * Tugas AI menyusut: nama dan jumlah datang dari sini, AI cuma menaksir berat
 * satu porsi (kalau dikosongkan dan ada foto) dan mengambil nilai gizinya.
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

  const hapus = (i: number) => {
    void Haptics.selectionAsync();
    onChange(items.filter((_, j) => j !== i));
  };

  const tambah = () => {
    void Haptics.selectionAsync();
    onChange([...items, barisKosong()]);
  };

  /**
   * Baris yang sedang diketik namanya. Saran cuma tampil untuk baris itu, dan
   * hilang begitu satu saran dipilih. Yang dicari adalah nama baris itu,
   * ditunda sebentar supaya tidak menembak server tiap huruf.
   */
  const [aktif, setAktif] = useState<number | null>(null);
  const kataCari = useTertunda(aktif === null ? '' : (items[aktif]?.name ?? ''), 250);
  const saran = useFoodSuggestions(kataCari);

  const pilihSaran = (i: number, s: FoodSuggestion) => {
    void Haptics.selectionAsync();
    const baris = items[i];
    if (!baris) return;
    onChange(items.map((item, j) => (j === i ? dariSaran(baris, s) : item)));
    setAktif(null);
  };

  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.rowHead}>
            <Text variant="overline" tone="tertiary">
              Makanan {i + 1}
            </Text>

            {items.length > 1 ? (
              <Pressable
                onPress={() => hapus(i)}
                disabled={disabled}
                hitSlop={8}
                accessibilityLabel={'Hapus makanan ' + (i + 1)}
                style={({ pressed }) => [styles.hapus, pressed && styles.pressed]}
              >
                <XIcon size={16} color={colors.textSecondary} weight="bold" />
              </Pressable>
            ) : null}
          </View>

          <Input
            value={item.name}
            onChangeText={(v) => ubah(i, { name: v })}
            onFocus={() => setAktif(i)}
            placeholder="Nama makanan, mis. ayam goreng tanpa kulit"
            autoCapitalize="sentences"
            maxLength={120}
            editable={!disabled}
          />

          {/*
            Saran dari catatan sendiri. Sekali sentuh nama, satuan, berat, dan
            kemasannya terisi, dan backend memakai angka yang sama dengan
            terakhir kali. Ini yang membuat kopi pagi jadi dua ketukan.
          */}
          {aktif === i && (saran.data?.length ?? 0) > 0 ? (
            <View style={styles.saran}>
              <View style={styles.saranJudul}>
                <ClockCounterClockwiseIcon size={12} color={colors.textTertiary} weight="bold" />
                <Text variant="caption" tone="tertiary">
                  Dari catatanmu
                </Text>
              </View>
              <View style={styles.saranChip}>
                {saran.data?.map((s) => (
                  <Chip
                    key={s.name + s.unit}
                    size="sm"
                    label={
                      s.name +
                      (s.weight_per_portion ? ' · ' + s.weight_per_portion + ' ' + s.unit : '') +
                      (s.label ? ' · ' + s.label.kcal + ' kkal' : '')
                    }
                    onPress={() => pilihSaran(i, s)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.angka}>
            <View style={styles.porsi}>
              <Input
                label="Porsi"
                value={item.portions}
                onChangeText={(v) => ubah(i, { portions: v })}
                placeholder="1"
                keyboardType="decimal-pad"
                editable={!disabled}
              />
            </View>

            <View style={styles.berat}>
              <Input
                label={
                  beratWajib && !item.pakaiKemasan
                    ? 'Berat per porsi'
                    : 'Berat per porsi (opsional)'
                }
                value={item.weight}
                onChangeText={(v) => ubah(i, { weight: v })}
                placeholder={
                  beratWajib && !item.pakaiKemasan ? '150' : item.pakaiKemasan ? '' : 'AI menaksir'
                }
                keyboardType="decimal-pad"
                suffix={item.unit}
                editable={!disabled}
              />
            </View>
          </View>

          {/*
            Satuan sebagai dua chip, bukan dropdown. Cuma ada dua pilihan, dan
            dropdown menyembunyikan yang sedang tidak dipilih. Chip ketiga
            membuka isian dari kemasan.
          */}
          <View style={styles.satuan}>
            <Chip
              label="gram"
              size="sm"
              active={item.unit === 'g'}
              onPress={() => ubah(i, { unit: 'g' })}
            />
            <Chip
              label="ml"
              size="sm"
              active={item.unit === 'ml'}
              onPress={() => ubah(i, { unit: 'ml' })}
            />
            <Chip
              label={item.pakaiKemasan ? 'Dari kemasan ✓' : 'Dari kemasan'}
              size="sm"
              active={item.pakaiKemasan}
              onPress={() => ubah(i, { pakaiKemasan: !item.pakaiKemasan })}
            />
          </View>

          {/*
            Angka kemasan menang mutlak atas taksiran AI. Diisi PER SATU porsi,
            backend yang mengalikan dengan jumlah porsi, sama seperti berat.
            Kalau semua item diisi dari kemasan, AI tidak dipanggil sama sekali.
          */}
          {item.pakaiKemasan ? (
            <View style={styles.kemasan}>
              <Input
                label="Kalori per porsi (dari kemasan)"
                value={item.labelKcal}
                onChangeText={(v) => ubah(i, { labelKcal: v })}
                placeholder="350"
                keyboardType="decimal-pad"
                suffix="kkal"
                editable={!disabled}
              />
              <View style={styles.angka}>
                <View style={styles.makro}>
                  <Input
                    label="Protein"
                    value={item.labelProtein}
                    onChangeText={(v) => ubah(i, { labelProtein: v })}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    suffix="g"
                    editable={!disabled}
                  />
                </View>
                <View style={styles.makro}>
                  <Input
                    label="Karbo"
                    value={item.labelCarbs}
                    onChangeText={(v) => ubah(i, { labelCarbs: v })}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    suffix="g"
                    editable={!disabled}
                  />
                </View>
                <View style={styles.makro}>
                  <Input
                    label="Lemak"
                    value={item.labelFat}
                    onChangeText={(v) => ubah(i, { labelFat: v })}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    suffix="g"
                    editable={!disabled}
                  />
                </View>
              </View>
              <Text variant="caption" tone="tertiary">
                Angka untuk satu porsi, persis seperti di kemasan. Jumlah porsinya dikalikan
                otomatis. Makro boleh dikosongkan.
              </Text>
            </View>
          ) : null}
        </View>
      ))}

      {bisaTambah ? (
        <Pressable
          onPress={tambah}
          disabled={disabled}
          style={({ pressed }) => [styles.tambah, pressed && styles.pressed]}
        >
          <PlusIcon size={16} color={colors.primary} weight="bold" />
          <Text variant="label" tone="accent">
            Tambah makanan
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

/**
 * Mengubah isian mentah jadi bentuk yang dikirim ke backend.
 *
 * Mengembalikan pesan kesalahan pertama yang ditemukan, atau daftar itemnya.
 * Pemeriksaan di sini sama dengan yang dilakukan backend, supaya pesannya
 * muncul sebelum request dikirim dan tanpa menunggu balasan.
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

const styles = StyleSheet.create({
  saran: { gap: spacing.xs },
  saranJudul: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  saranChip: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  list: { gap: spacing.md },
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hapus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  pressed: { opacity: 0.7 },
  angka: { flexDirection: 'row', gap: spacing.sm },
  porsi: { flex: 1 },
  berat: { flex: 2 },
  satuan: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kemasan: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  makro: { flex: 1 },
  tambah: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
});
