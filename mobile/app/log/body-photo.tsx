import { Image } from 'expo-image';
import { CameraIcon, SparkleIcon, TrashIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { PhotoSlot } from '@/components/features/PhotoSlot';
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Header,
  IconCircle,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { imageSource, toApiError } from '@/lib/api';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import {
  useBodyPhotoRange,
  useBodyPhotoToday,
  useCreateBodyPhoto,
  useDeleteBodyPhoto,
} from '@/services/body-photos.service';
import { longDate, shiftDays, todayWIB } from '@/utils/date';

export default function BodyPhotoScreen() {
  const hariIni = todayWIB();

  const today = useBodyPhotoToday();
  const riwayat = useBodyPhotoRange(shiftDays(hariIni, -89), hariIni);
  const createPhoto = useCreateBodyPhoto();
  const deletePhoto = useDeleteBodyPhoto();
  const picker = usePhotoPicker();

  const [depan, setDepan] = useState<string | null>(null);
  const [samping, setSamping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ambil = async (sisi: 'depan' | 'samping', dari: 'kamera' | 'galeri') => {
    const hasil = dari === 'kamera' ? await picker.dariKamera() : await picker.dariGaleri();
    if (!hasil) return;

    setError(null);
    if (sisi === 'depan') setDepan(hasil);
    else setSamping(hasil);
  };

  const simpan = () => {
    if (!depan || !samping) {
      setError('Butuh dua foto: tampak depan dan tampak samping');
      return;
    }

    setError(null);

    createPhoto.mutate(
      { front: depan, side: samping },
      {
        onSuccess: () => {
          setDepan(null);
          setSamping(null);
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  const hapus = (id: string) => {
    Alert.alert('Hapus foto ini?', 'Foto dan hasil analisanya akan hilang permanen.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deletePhoto.mutate(id) },
    ]);
  };

  const sudahHariIni = today.data !== null && today.data !== undefined;

  return (
    <Screen refreshing={riwayat.isRefetching} onRefresh={() => void riwayat.refetch()}>
      <Header
        title="Foto badan"
        subtitle={sudahHariIni ? 'Sudah difoto hari ini' : 'Satu set per hari'}
      />

      <Card variant="outline" padding="md">
        <Text variant="caption" tone="secondary">
          Foto di tempat, jarak, dan pencahayaan yang sama setiap kali. Perubahan bentuk badan baru
          terlihat kalau kondisinya konsisten.
        </Text>
      </Card>

      <View style={styles.photoRow}>
        <PhotoSlot
          uri={depan}
          label="Tampak depan"
          onCamera={() => void ambil('depan', 'kamera')}
          onGallery={() => void ambil('depan', 'galeri')}
          onClear={() => setDepan(null)}
          aspectRatio={3 / 4}
          disabled={picker.sibuk || createPhoto.isPending}
        />

        <PhotoSlot
          uri={samping}
          label="Tampak samping"
          onCamera={() => void ambil('samping', 'kamera')}
          onGallery={() => void ambil('samping', 'galeri')}
          onClear={() => setSamping(null)}
          aspectRatio={3 / 4}
          disabled={picker.sibuk || createPhoto.isPending}
        />
      </View>

      {error ? <ErrorNote message={error} /> : null}

      {createPhoto.isPending ? (
        <Card variant="outline" padding="md">
          <View style={styles.analyzing}>
            <SparkleIcon size={20} color={colors.primary} weight="duotone" />
            <Text variant="caption" tone="secondary" style={styles.analyzingText}>
              Mengunggah dan menganalisa dua foto sekaligus. Butuh waktu lebih lama dari biasanya,
              jangan tutup layar ini.
            </Text>
          </View>
        </Card>
      ) : null}

      <Button
        label="Analisa & simpan"
        onPress={simpan}
        loading={createPhoto.isPending}
        disabled={!depan || !samping}
        size="lg"
      />

      <SectionHeader title="Riwayat" />

      {riwayat.isPending ? (
        <Loading />
      ) : (riwayat.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CameraIcon size={30} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada foto progres"
          message="Ambil set pertama hari ini sebagai titik awal."
        />
      ) : (
        riwayat.data?.map((foto) => {
          const analisa = foto.ai_analysis;

          return (
            <Card key={foto.id}>
              <View style={styles.historyCard}>
                <View style={styles.historyHead}>
                  <View style={styles.historyText}>
                    <Text variant="label">{longDate(foto.logged_at)}</Text>
                    {analisa?.estimated_body_fat_percent != null ? (
                      <Text variant="caption" tone="accent">
                        Perkiraan lemak tubuh {analisa.estimated_body_fat_percent}%
                      </Text>
                    ) : null}
                  </View>

                  <IconCircle size={36} onPress={() => hapus(foto.id)}>
                    <TrashIcon size={16} color={colors.textSecondary} weight="regular" />
                  </IconCircle>
                </View>

                <View style={styles.historyPhotos}>
                  <Image
                    source={imageSource(foto.front_photo_url)}
                    style={styles.historyImage}
                    contentFit="cover"
                    transition={200}
                  />
                  <Image
                    source={imageSource(foto.side_photo_url)}
                    style={styles.historyImage}
                    contentFit="cover"
                    transition={200}
                  />
                </View>

                {analisa?.posture_notes ? (
                  <View style={styles.analysis}>
                    <Text variant="caption" tone="tertiary">
                      Postur
                    </Text>
                    <Text variant="caption" tone="secondary">
                      {analisa.posture_notes}
                    </Text>
                  </View>
                ) : null}

                {analisa?.visible_changes ? (
                  <View style={styles.analysis}>
                    <Text variant="caption" tone="tertiary">
                      Perubahan terlihat
                    </Text>
                    <Text variant="caption" tone="secondary">
                      {analisa.visible_changes}
                    </Text>
                  </View>
                ) : null}

                {(analisa?.recommendations?.length ?? 0) > 0 ? (
                  <View style={styles.analysis}>
                    <Text variant="caption" tone="tertiary">
                      Saran
                    </Text>
                    {analisa?.recommendations?.map((saran, i) => (
                      <Text key={i} variant="caption" tone="secondary">
                        • {saran}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', gap: spacing.md },
  analyzing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  analyzingText: { flex: 1 },
  historyCard: { gap: spacing.md },
  historyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyText: { flex: 1, gap: 2 },
  historyPhotos: { flexDirection: 'row', gap: spacing.sm },
  historyImage: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  analysis: { gap: 2 },
});
