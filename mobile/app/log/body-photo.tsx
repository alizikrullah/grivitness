import { CameraIcon, SparkleIcon, TrashIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PhotoSlot } from '@/components/features/PhotoSlot';
import { RemoteImage } from '@/components/features/RemoteImage';
import {
  Button,
  Card,
  ConfirmDialog,
  DateStrip,
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
import { toApiError } from '@/lib/api';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import {
  useBodyPhotoDate,
  useBodyPhotoRange,
  useCreateBodyPhoto,
  useDeleteBodyPhoto,
} from '@/services/body-photos.service';
import { dayPhrase, longDate, shiftDays, todayWIB } from '@/utils/date';

export default function BodyPhotoScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk melengkapi hari yang terlewat.
   */
  const [dipilih, setDipilih] = useState(todayWIB());

  const hariIni = todayWIB();

  const today = useBodyPhotoDate(dipilih);
  const riwayat = useBodyPhotoRange(shiftDays(hariIni, -89), hariIni);
  const createPhoto = useCreateBodyPhoto();
  const deletePhoto = useDeleteBodyPhoto();
  const picker = usePhotoPicker();

  const [depan, setDepan] = useState<string | null>(null);
  const [samping, setSamping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Foto yang sudah dipilih dilepas saat pindah tanggal, disetel ulang saat
   * render dan bukan lewat useEffect. Tanpa ini foto untuk hari ini ikut
   * terbawa dan tersimpan ke tanggal yang salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(dipilih);
  if (dipilih !== tanggalTerakhir) {
    setTanggalTerakhir(dipilih);
    setDepan(null);
    setSamping(null);
    setError(null);
  }

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
      // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
      { front: depan, side: samping, logged_at: dipilih },
      {
        onSuccess: () => {
          setDepan(null);
          setSamping(null);
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  /** Id foto yang sedang ditanyakan konfirmasi hapusnya. */
  const [akanDihapus, setAkanDihapus] = useState<string | null>(null);

  const sudahHariIni = today.data !== null && today.data !== undefined;

  return (
    <Screen refreshing={riwayat.isRefetching} onRefresh={() => void riwayat.refetch()}>
      <Header
        title="Foto badan"
        subtitle={sudahHariIni ? 'Sudah difoto ' + dayPhrase(dipilih) : 'Satu set per hari'}
      />

      <DateStrip value={dipilih} onChange={setDipilih} />

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

                  <IconCircle size={36} onPress={() => setAkanDihapus(foto.id)}>
                    <TrashIcon size={16} color={colors.textSecondary} weight="regular" />
                  </IconCircle>
                </View>

                <View style={styles.historyPhotos}>
                  <RemoteImage
                    path={foto.front_photo_url}
                    style={styles.historyImage}
                    aspectRatio={3 / 4}
                    accessibilityLabel="Foto badan tampak depan"
                  />
                  <RemoteImage
                    path={foto.side_photo_url}
                    style={styles.historyImage}
                    aspectRatio={3 / 4}
                    accessibilityLabel="Foto badan tampak samping"
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

      <ConfirmDialog
        visible={akanDihapus !== null}
        title="Hapus foto ini?"
        message="Foto depan, foto samping, dan hasil analisanya akan hilang permanen."
        onCancel={() => setAkanDihapus(null)}
        onConfirm={() => {
          const id = akanDihapus;
          setAkanDihapus(null);
          if (id) deletePhoto.mutate(id);
        }}
      />
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
  // aspectRatio sengaja TIDAK di sini, melainkan lewat prop RemoteImage, supaya
  // tingginya dihitung dari lebar terukur dan bukan diselesaikan Yoga.
  historyImage: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  analysis: { gap: 2 },
});
