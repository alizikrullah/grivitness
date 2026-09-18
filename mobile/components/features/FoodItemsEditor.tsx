import * as Haptics from 'expo-haptics';
import { PlusIcon, XIcon } from 'phosphor-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Chip, Input, Text } from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import type { FoodItemInput } from '@/services/food.service';
import type { FoodUnit } from '@/types';

/**
 * Satu baris isian, semuanya teks mentah. Angkanya baru diubah saat disimpan,
 * supaya user bisa mengetik "0," tanpa langsung ditolak di tengah jalan.
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
            placeholder="Nama makanan, mis. ayam goreng tanpa kulit"
            autoCapitalize="sentences"
            maxLength={120}
            editable={!disabled}
          />

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
                label={beratWajib ? 'Berat per porsi' : 'Berat per porsi (opsional)'}
                value={item.weight}
                onChangeText={(v) => ubah(i, { weight: v })}
                placeholder={beratWajib ? '150' : 'AI menaksir'}
                keyboardType="decimal-pad"
                suffix={item.unit}
                editable={!disabled}
              />
            </View>
          </View>

          {/*
            Satuan sebagai dua chip, bukan dropdown. Cuma ada dua pilihan, dan
            dropdown menyembunyikan yang sedang tidak dipilih.
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
          </View>
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

const styles = StyleSheet.create({
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
  satuan: { flexDirection: 'row', gap: spacing.sm },
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
