import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ChipGroup, ErrorNote, Input, Sheet, Text } from '@/components/ui';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useUpdateFood } from '@/services/food.service';
import type { FoodLog, MealType } from '@/types';
import { toNum } from '@/utils/format';

interface FoodEditSheetProps {
  log: FoodLog;
  onClose: () => void;
}

/**
 * Mengoreksi hasil analisa AI.
 *
 * Daftar makanan disunting sebagai satu baris dipisah koma, bukan sebagai
 * daftar yang bisa ditambah-kurang satu per satu. Untuk tiga sampai lima nama
 * hidangan, mengetik ulang satu baris jauh lebih cepat daripada menekan tombol
 * hapus di tiap baris lalu menambah yang baru.
 */
export const FoodEditSheet = ({ log, onClose }: FoodEditSheetProps) => {
  const update = useUpdateFood();

  const [makanan, setMakanan] = useState((log.ai_analysis?.foods_detected ?? []).join(', '));
  const [jenis, setJenis] = useState<MealType>(log.meal_type);
  const [kalori, setKalori] = useState(String(log.total_calories));
  const [protein, setProtein] = useState(String(toNum(log.protein_g) ?? 0));
  const [karbo, setKarbo] = useState(String(toNum(log.carbs_g) ?? 0));
  const [lemak, setLemak] = useState(String(toNum(log.fat_g) ?? 0));
  const [catatan, setCatatan] = useState(log.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  /** Angka yang tidak terbaca dikembalikan sebagai undefined supaya field itu tidak ikut dikirim. */
  const angka = (teks: string): number | undefined => {
    const nilai = toNum(teks.replace(',', '.'));
    return nilai === null || nilai < 0 ? undefined : nilai;
  };

  const simpan = () => {
    const kaloriBaru = angka(kalori);

    if (kaloriBaru === undefined) {
      setError('Kalori harus berupa angka');
      return;
    }

    setError(null);

    update.mutate(
      {
        id: log.id,
        meal_type: jenis,
        notes: catatan.trim() === '' ? null : catatan.trim(),
        foods_detected: makanan
          .split(',')
          .map((nama) => nama.trim())
          .filter((nama) => nama !== ''),
        total_calories: Math.round(kaloriBaru),
        protein_g: angka(protein),
        carbs_g: angka(karbo),
        fat_g: angka(lemak),
      },
      {
        onSuccess: onClose,
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Betulkan catatan"
      footer={
        <Button label="Simpan perubahan" onPress={simpan} loading={update.isPending} size="lg" />
      }
    >
      <Input
        label="Makanan"
        value={makanan}
        onChangeText={setMakanan}
        placeholder="Sate lontong, bumbu kacang"
        hint="Pisahkan dengan koma"
        autoCapitalize="sentences"
        multiline
      />

      <View style={styles.group}>
        <Text variant="label" tone="secondary">
          Jenis makan
        </Text>
        <ChipGroup
          options={MEAL_OPTIONS}
          value={jenis}
          onChange={setJenis}
          labels={MEAL_LABEL}
          wrap
        />
      </View>

      <Input
        label="Kalori"
        value={kalori}
        onChangeText={setKalori}
        keyboardType="number-pad"
        suffix="kkal"
      />

      <View style={styles.macros}>
        <View style={styles.macroItem}>
          <Input
            label="Protein"
            value={protein}
            onChangeText={setProtein}
            keyboardType="decimal-pad"
            suffix="g"
          />
        </View>
        <View style={styles.macroItem}>
          <Input
            label="Karbo"
            value={karbo}
            onChangeText={setKarbo}
            keyboardType="decimal-pad"
            suffix="g"
          />
        </View>
        <View style={styles.macroItem}>
          <Input
            label="Lemak"
            value={lemak}
            onChangeText={setLemak}
            keyboardType="decimal-pad"
            suffix="g"
          />
        </View>
      </View>

      <Input
        label="Catatan"
        value={catatan}
        onChangeText={setCatatan}
        placeholder="Opsional"
        maxLength={1000}
        autoCapitalize="sentences"
        multiline
      />

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  macros: { flexDirection: 'row', gap: spacing.sm },
  macroItem: { flex: 1 },
});
