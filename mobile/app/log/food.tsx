import { ForkKnifeIcon, SparkleIcon, WarningCircleIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FoodEditSheet } from '@/components/features/FoodEditSheet';
import {
  barisKosong,
  type FoodItemDraft,
  FoodItemsEditor,
  susunItem,
} from '@/components/features/FoodItemsEditor';
import { LogActions } from '@/components/features/LogActions';
import { RemoteImage } from '@/components/features/RemoteImage';
import { MacroBar } from '@/components/features/Metrics';
import { PhotoSlot } from '@/components/features/PhotoSlot';
import {
  Button,
  Card,
  ChipGroup,
  DateStrip,
  EmptyState,
  ErrorNote,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors } from '@/constants/colors';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useCreateFood, useDeleteFood, useFoodDate } from '@/services/food.service';
import type { FoodItem, FoodLog, MealType } from '@/types';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { dayPhrase, timeWIB, todayWIB, wibToISO } from '@/utils/date';
import { thousands, toNum } from '@/utils/format';

/** Jenis makan yang ditawarkan lebih dulu, ditebak dari jam WIB saat ini. */
const tebakJenisMakan = (): MealType => {
  const jam = new Date().getHours();
  if (jam < 10) return 'BREAKFAST';
  if (jam < 15) return 'LUNCH';
  if (jam < 21) return 'DINNER';
  return 'SNACK';
};

/** "2 × 150 g" atau "250 ml" kalau porsinya satu. */
const ringkasJumlah = (item: FoodItem): string =>
  (item.portions === 1 ? '' : `${item.portions} × `) +
  `${thousands(item.weight_per_portion)} ${item.unit}`;

export default function FoodScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [tanggal, setTanggal] = useState(todayWIB());
  const hariIni = tanggal === todayWIB();

  const today = useFoodDate(tanggal);
  const createFood = useCreateFood();
  const deleteFood = useDeleteFood();
  const picker = usePhotoPicker();

  const [uri, setUri] = useState<string | null>(null);
  const [jenis, setJenis] = useState<MealType>(tebakJenisMakan());
  const [items, setItems] = useState<FoodItemDraft[]>([barisKosong()]);
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<FoodLog | null>(null);

  const ambil = async (dari: 'kamera' | 'galeri') => {
    const hasil = dari === 'kamera' ? await picker.dariKamera() : await picker.dariGaleri();
    if (hasil) {
      setUri(hasil);
      setError(null);
    }
  };

  const simpan = () => {
    // Tanpa foto tidak ada yang bisa menaksir berat, jadi beratnya wajib.
    const susunan = susunItem(items, uri === null);

    if ('error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    createFood.mutate(
      {
        uri,
        meal_type: jenis,
        items: susunan.items,
        // Saat menelusuri hari lampau, makanan dicatat ke tanggal ITU, bukan ke
        // hari ini. Tengah hari dipakai sebagai jam netral karena jam
        // sesungguhnya sudah tidak bisa diingat lagi.
        logged_at: hariIni ? undefined : wibToISO(tanggal, '12:00'),
      },
      {
        onSuccess: () => {
          setUri(null);
          setItems([barisKosong()]);
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <>
      <Screen>
        <Header title="Makanan" subtitle="Tulis apa yang kamu makan, AI menaksir gizinya" />

        <DateStrip value={tanggal} onChange={setTanggal} />

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

        {/*
          Daftar makanan yang ditulis user adalah sumber kebenarannya. Foto di
          bawah cuma pelengkap untuk menaksir berat yang dikosongkan. Dulu
          terbalik: foto wajib, tulisan opsional, dan jumlah porsi yang ditulis
          user diabaikan model.
        */}
        <FoodItemsEditor
          items={items}
          onChange={setItems}
          beratWajib={uri === null}
          disabled={createFood.isPending}
        />

        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Foto (opsional)
          </Text>
          <Text variant="caption" tone="tertiary">
            Kalau ada foto, berat yang kamu kosongkan ditaksir dari sana. Tanpa foto, isi perkiraan
            beratnya sendiri.
          </Text>
          <View style={styles.photoRow}>
            <PhotoSlot
              uri={uri}
              label="Foto makanan"
              onCamera={() => void ambil('kamera')}
              onGallery={() => void ambil('galeri')}
              onClear={() => setUri(null)}
              aspectRatio={4 / 3}
              disabled={picker.sibuk || createFood.isPending}
            />
          </View>
        </View>

        {error ? <ErrorNote message={error} /> : null}

        {createFood.isPending ? (
          <Card variant="outline" padding="md">
            <View style={styles.analyzing}>
              <SparkleIcon size={20} color={colors.primary} weight="duotone" />
              <Text variant="caption" tone="secondary" style={styles.analyzingText}>
                {uri
                  ? 'Menaksir berat dan gizinya dari foto. Ini bisa memakan waktu sampai satu menit.'
                  : 'Mengambil nilai gizinya. Sebentar.'}
              </Text>
            </View>
          </Card>
        ) : null}

        <Button
          label={uri ? 'Analisa & simpan' : 'Hitung & simpan'}
          onPress={simpan}
          loading={createFood.isPending}
          size="lg"
        />

        <SectionHeader
          title={'Makan ' + dayPhrase(tanggal)}
          action={
            <Text variant="caption" tone="tertiary">
              {thousands(today.data?.total_calories ?? 0)} kkal
            </Text>
          }
        />

        {today.isPending ? (
          <Loading />
        ) : (today.data?.logs.length ?? 0) === 0 ? (
          <EmptyState
            icon={<ForkKnifeIcon size={30} color={colors.textTertiary} weight="duotone" />}
            title="Belum ada catatan makan"
            message="Tulis makananmu di atas, gizinya ditaksir otomatis."
          />
        ) : (
          <>
            <Card>
              <View style={styles.macroCard}>
                <Text variant="label">{'Total gizi ' + dayPhrase(tanggal)}</Text>
                <MacroBar
                  protein={today.data?.total_protein_g ?? 0}
                  carbs={today.data?.total_carbs_g ?? 0}
                  fat={today.data?.total_fat_g ?? 0}
                />
              </View>
            </Card>

            {today.data?.logs.map((log) => {
              const analisa = log.ai_analysis;
              const rincian = analisa?.items ?? [];

              return (
                <Card key={log.id} padding="md">
                  <View style={styles.logCard}>
                    <View style={styles.logRow}>
                      {log.photo_url ? (
                        <RemoteImage
                          path={log.photo_url}
                          style={styles.thumb}
                          accessibilityLabel={'Foto ' + MEAL_LABEL[log.meal_type]}
                        />
                      ) : (
                        <View style={[styles.thumb, styles.thumbKosong]}>
                          <ForkKnifeIcon size={22} color={colors.textTertiary} weight="duotone" />
                        </View>
                      )}

                      <View style={styles.logText}>
                        <Text variant="label" numberOfLines={1}>
                          {MEAL_LABEL[log.meal_type]} · {thousands(log.total_calories)} kkal
                        </Text>

                        <Text variant="caption" tone="secondary" numberOfLines={2}>
                          {rincian.map((item) => item.name).join(', ') || 'Tanpa rincian'}
                        </Text>

                        <Text variant="caption" tone="tertiary">
                          {timeWIB(log.logged_at)} WIB · P {toNum(log.protein_g)?.toFixed(0) ?? 0}g
                          · K {toNum(log.carbs_g)?.toFixed(0) ?? 0}g · L{' '}
                          {toNum(log.fat_g)?.toFixed(0) ?? 0}g
                        </Text>
                      </View>

                      <LogActions
                        onEdit={() => setDiedit(log)}
                        onDelete={() => deleteFood.mutate(log.id)}
                        deleteMessage={
                          MEAL_LABEL[log.meal_type] +
                          ' ' +
                          thousands(log.total_calories) +
                          ' kkal akan dihapus' +
                          (log.photo_url ? ' beserta fotonya' : '') +
                          ', dan tidak bisa dikembalikan.'
                        }
                      />
                    </View>

                    {/*
                      Tulisan menang atas foto, tapi kalau model melihat makanan
                      yang jelas berbeda, user diberi tahu. Bukan untuk menolak
                      catatannya, cuma supaya salah pilih foto ketahuan.
                    */}
                    {analisa?.photo_matches === false ? (
                      <View style={styles.peringatan}>
                        <WarningCircleIcon size={16} color={colors.warning} weight="duotone" />
                        <Text variant="caption" tone="warning" style={styles.peringatanText}>
                          Foto terlihat berbeda dari yang ditulis.
                          {analisa.photo_note ? ' ' + analisa.photo_note : ''}
                        </Text>
                      </View>
                    ) : null}

                    {/*
                      Rincian per makanan: jumlah × berat per porsi, lalu
                      kalorinya. Ini yang membuat totalnya bisa diperiksa:
                      kalau meleset, kelihatan di baris mana.
                    */}
                    {rincian.length > 0 ? (
                      <View style={styles.rincian}>
                        {rincian.map((item, i) => (
                          <View key={item.name + i} style={styles.rincianRow}>
                            <Text
                              variant="caption"
                              tone="secondary"
                              style={styles.rincianNama}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>

                            <Text variant="caption" tone="tertiary">
                              {ringkasJumlah(item)}
                            </Text>

                            <Text
                              variant="caption"
                              tone={item.nutrition_missing ? 'warning' : 'primary'}
                              style={styles.rincianKkal}
                            >
                              {item.nutrition_missing
                                ? 'belum ditaksir'
                                : thousands(item.calories) + ' kkal'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </Screen>

      {/* key memaksa isian sheet dibuat ulang tiap ganti log. Tanpa itu, nilai
          dari log yang dibuka sebelumnya masih tertinggal di kolomnya. */}
      {diedit ? (
        <FoodEditSheet key={diedit.id} log={diedit} onClose={() => setDiedit(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row' },
  group: { gap: spacing.md },
  analyzing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  analyzingText: { flex: 1 },
  macroCard: { gap: spacing.lg },
  logCard: { gap: spacing.md },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  peringatan: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  peringatanText: { flex: 1 },
  rincian: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rincianRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* flex: 1 supaya nama panjang terpotong di ujungnya, bukan mendorong angka
     kalorinya keluar dari kartu. */
  rincianNama: { flex: 1 },
  rincianKkal: { minWidth: 72, textAlign: 'right' },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  thumbKosong: { alignItems: 'center', justifyContent: 'center' },
  logText: { flex: 1, gap: 2 },
});
