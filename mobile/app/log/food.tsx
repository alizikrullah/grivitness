import { ForkKnifeIcon, SparkleIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FoodEditSheet } from '@/components/features/FoodEditSheet';
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
  Input,
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
import type { FoodLog, MealType } from '@/types';
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
  const [catatan, setCatatan] = useState('');
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
    if (!uri) {
      setError('Ambil foto makanannya dulu');
      return;
    }

    setError(null);

    createFood.mutate(
      {
        uri,
        meal_type: jenis,
        notes: catatan.trim() === '' ? undefined : catatan.trim(),
        // Saat menelusuri hari lampau, makanan dicatat ke tanggal ITU, bukan ke
        // hari ini. Tengah hari dipakai sebagai jam netral karena jam
        // sesungguhnya sudah tidak bisa diingat lagi.
        logged_at: hariIni ? undefined : wibToISO(tanggal, '12:00'),
      },
      {
        onSuccess: () => {
          setUri(null);
          setCatatan('');
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <>
      <Screen>
        <Header title="Makanan" subtitle="Foto piringnya, AI yang memperkirakan gizinya" />

        <DateStrip value={tanggal} onChange={setTanggal} />

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
          label="Catatan"
          value={catatan}
          onChangeText={setCatatan}
          placeholder="Opsional. Misalnya: nasi setengah porsi"
          multiline
          maxLength={1000}
          autoCapitalize="sentences"
        />

        {error ? <ErrorNote message={error} /> : null}

        {createFood.isPending ? (
          <Card variant="outline" padding="md">
            <View style={styles.analyzing}>
              <SparkleIcon size={20} color={colors.primary} weight="duotone" />
              <Text variant="caption" tone="secondary" style={styles.analyzingText}>
                Menganalisa foto. Ini bisa memakan waktu sampai satu menit.
              </Text>
            </View>
          </Card>
        ) : null}

        <Button
          label="Analisa & simpan"
          onPress={simpan}
          loading={createFood.isPending}
          disabled={!uri}
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
            message="Foto makananmu, sisanya diperkirakan otomatis."
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
              const terdeteksi = log.ai_analysis?.foods_detected ?? [];
              const rincian = log.ai_analysis?.items ?? [];

              return (
                <Card key={log.id} padding="md">
                  <View style={styles.logCard}>
                    <View style={styles.logRow}>
                      <RemoteImage
                        path={log.photo_url}
                        style={styles.thumb}
                        accessibilityLabel={'Foto ' + MEAL_LABEL[log.meal_type]}
                      />

                      <View style={styles.logText}>
                        <Text variant="label" numberOfLines={1}>
                          {MEAL_LABEL[log.meal_type]} · {thousands(log.total_calories)} kkal
                        </Text>

                        <Text variant="caption" tone="secondary" numberOfLines={2}>
                          {terdeteksi.length > 0
                            ? terdeteksi.join(', ')
                            : (log.notes ?? 'Tanpa keterangan')}
                        </Text>

                        <Text variant="caption" tone="tertiary">
                          {timeWIB(log.logged_at)} WIB · P {toNum(log.protein_g)?.toFixed(0) ?? 0}g
                          · K {toNum(log.carbs_g)?.toFixed(0) ?? 0}g · L{' '}
                          {toNum(log.fat_g)?.toFixed(0) ?? 0}g
                        </Text>
                      </View>

                      {/*
                      Lewat LogActions, bukan tombol telanjang.

                      Sebelumnya tombol hapus di sini langsung menghapus begitu
                      disentuh, padahal ukurannya kecil dan duduk persis di
                      sebelah tombol ubah. Satu salah sentuh menghilangkan foto
                      beserta analisanya, dan backend tidak punya undo.
                    */}
                      <LogActions
                        onEdit={() => setDiedit(log)}
                        onDelete={() => deleteFood.mutate(log.id)}
                        deleteMessage={
                          MEAL_LABEL[log.meal_type] +
                          ' ' +
                          thousands(log.total_calories) +
                          ' kkal akan dihapus beserta fotonya, dan tidak bisa dikembalikan.'
                        }
                      />
                    </View>

                    {/*
                    Rincian per bahan beserta beratnya. Ini yang membuat angka
                    kalorinya bisa diperiksa: kalau totalnya terasa meleset,
                    kelihatan bagian mana yang salah ditaksir, bukan cuma satu
                    angka besar yang harus dipercaya begitu saja.

                    Kosong pada catatan lama yang dibuat sebelum analisa
                    diuraikan per bahan.
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
                              {thousands(item.grams)} g
                            </Text>

                            <Text variant="caption" style={styles.rincianKkal}>
                              {thousands(item.calories)} kkal
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
  rincianKkal: { minWidth: 64, textAlign: 'right' },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  logText: { flex: 1, gap: 2 },
  logActions: { gap: spacing.sm },
});
