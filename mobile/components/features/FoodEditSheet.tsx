import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  type FoodItemDraft,
  FoodItemsEditor,
  susunItem,
} from '@/components/features/FoodItemsEditor';
import { RemoteImage } from '@/components/features/RemoteImage';
import { Button, ChipGroup, ErrorNote, Sheet, Text } from '@/components/ui';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useUpdateFood } from '@/services/food.service';
import type { FoodLog, MealType } from '@/types';

interface FoodEditSheetProps {
  log: FoodLog;
  onClose: () => void;
}

/**
 * Mengoreksi sesi makan tanpa memanggil AI lagi.
 *
 * Yang disunting adalah nama, jumlah porsi, dan berat tiap item. Nilai gizi
 * per 100 sudah tersimpan dari analisa pertama, jadi backend tinggal
 * menghitung ulang. Karena itu berat wajib di sini: tidak ada foto yang
 * dianalisa ulang untuk menaksirnya, dan yang tampil adalah berat yang
 * dipakai terakhir kali.
 *
 * Menambah makanan dimatikan. Makanan baru butuh taksiran gizi baru, dan itu
 * sesi makan baru.
 */
export const FoodEditSheet = ({ log, onClose }: FoodEditSheetProps) => {
  const update = useUpdateFood();

  const [jenis, setJenis] = useState<MealType>(log.meal_type);
  const [items, setItems] = useState<FoodItemDraft[]>(
    (log.ai_analysis?.items ?? []).map((item) => ({
      name: item.name,
      portions: String(item.portions),
      weight: item.weight_per_portion > 0 ? String(item.weight_per_portion) : '',
      unit: item.unit,
      // PREVIOUS dari kemasan membawa labelnya, jadi dibuka juga.
      pakaiKemasan: item.label !== null,
      labelKcal: item.label ? String(item.label.kcal) : '',
      labelProtein: item.label?.protein_g ? String(item.label.protein_g) : '',
      labelCarbs: item.label?.carbs_g ? String(item.label.carbs_g) : '',
      labelFat: item.label?.fat_g ? String(item.label.fat_g) : '',
    })),
  );
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    const susunan = susunItem(items, true);

    if ('error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    update.mutate(
      {
        id: log.id,
        meal_type: jenis,
        items: susunan.items,
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
      {/*
        Fotonya di paling atas kalau ada, sebagai rujukan untuk menilai berat
        yang ditaksir. Mengoreksi tanpa melihat piringnya berarti menebak dua
        kali.
      */}
      {log.photo_url ? (
        <RemoteImage
          path={log.photo_url}
          style={styles.foto}
          aspectRatio={4 / 3}
          accessibilityLabel={'Foto ' + MEAL_LABEL[log.meal_type]}
        />
      ) : null}

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

      <FoodItemsEditor
        items={items}
        onChange={setItems}
        beratWajib
        bisaTambah={false}
        disabled={update.isPending}
      />

      <Text variant="caption" tone="tertiary">
        Kalorinya dihitung ulang tanpa memanggil AI lagi. Kalau taksiran AI meleset dan kemasannya
        ada, buka bagian Dari kemasan dan isi angkanya, itu yang dipakai. Untuk makanan yang belum
        ada di daftar, catat sebagai sesi baru.
      </Text>

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  // Perbandingan sisinya disamakan dengan kotak pengambilan foto di layar
  // catat, supaya yang terlihat di sini sama persis dengan yang dipotret.
  // aspectRatio lewat prop RemoteImage, bukan di sini. Lihat catatan di sana.
  foto: { width: '100%', borderRadius: radius.lg },
  group: { gap: spacing.md },
});
