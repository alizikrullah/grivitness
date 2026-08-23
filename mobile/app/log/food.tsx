import { Image } from 'expo-image';
import { ForkKnifeIcon, PencilSimpleIcon, SparkleIcon, TrashIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { FoodEditSheet } from '@/components/features/FoodEditSheet';
import { MacroBar } from '@/components/features/Metrics';
import { PhotoSlot } from '@/components/features/PhotoSlot';
import {
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNote,
  Header,
  IconCircle,
  Input,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors } from '@/constants/colors';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { imageSource, toApiError } from '@/lib/api';
import { useCreateFood, useDeleteFood, useFoodToday } from '@/services/food.service';
import type { FoodLog, MealType } from '@/types';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import { timeWIB } from '@/utils/date';
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
  const today = useFoodToday();
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <Header title="Makanan" subtitle="Foto piringnya, AI yang memperkirakan gizinya" />

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
          title="Makan hari ini"
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
                <Text variant="label">Total gizi hari ini</Text>
                <MacroBar
                  protein={today.data?.total_protein_g ?? 0}
                  carbs={today.data?.total_carbs_g ?? 0}
                  fat={today.data?.total_fat_g ?? 0}
                />
              </View>
            </Card>

            {today.data?.logs.map((log) => {
              const terdeteksi = log.ai_analysis?.foods_detected ?? [];

              return (
                <Card key={log.id} padding="md">
                  <View style={styles.logRow}>
                    <Image
                      source={imageSource(log.photo_url)}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={200}
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
                        {timeWIB(log.logged_at)} WIB · P {toNum(log.protein_g)?.toFixed(0) ?? 0}g ·
                        K {toNum(log.carbs_g)?.toFixed(0) ?? 0}g · L{' '}
                        {toNum(log.fat_g)?.toFixed(0) ?? 0}g
                      </Text>
                    </View>

                    <View style={styles.logActions}>
                      <IconCircle size={36} onPress={() => setDiedit(log)}>
                        <PencilSimpleIcon size={16} color={colors.textSecondary} weight="regular" />
                      </IconCircle>
                      <IconCircle size={36} onPress={() => deleteFood.mutate(log.id)}>
                        <TrashIcon size={16} color={colors.textSecondary} weight="regular" />
                      </IconCircle>
                    </View>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  photoRow: { flexDirection: 'row' },
  group: { gap: spacing.md },
  analyzing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  analyzingText: { flex: 1 },
  macroCard: { gap: spacing.lg },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  logText: { flex: 1, gap: 2 },
  logActions: { gap: spacing.sm },
});
