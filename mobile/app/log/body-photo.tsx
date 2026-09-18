import { CameraIcon, RulerIcon, SparkleIcon, TrashIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PhotoSlot } from '@/components/features/PhotoSlot';
import { RemoteImage } from '@/components/features/RemoteImage';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DateStrip,
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
import { colors, metricColors } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { usePhotoPicker } from '@/hooks/usePhotoPicker';
import {
  useBodyComparison,
  useBodyPhotoDate,
  useBodyPhotoRange,
  useCreateBodyPhoto,
  useDeleteBodyPhoto,
  useRequestComparison,
} from '@/services/body-photos.service';
import { useMeasurementDate, useSaveMeasurement } from '@/services/measurements.service';
import type { BodyDirection } from '@/types';
import { dayPhrase, longDate, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { toNum } from '@/utils/format';

/** Label arah, sengaja kata biasa dan bukan angka. */
const ARAH_LABEL: Record<BodyDirection, string> = {
  LEANER: 'Terlihat lebih ramping',
  SAME: 'Terlihat sama',
  FULLER: 'Terlihat lebih berisi',
  UNCLEAR: 'Tidak bisa dibandingkan',
};

export default function BodyPhotoScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk melengkapi hari yang terlewat.
   */
  const [dipilih, setDipilih] = useState(todayWIB());

  const hariIni = todayWIB();

  const today = useBodyPhotoDate(dipilih);
  // Setahun ke belakang, bukan tiga bulan: ini catatan bulanan, dan
  // perbandingannya justru paling berguna untuk rentang yang panjang.
  const riwayat = useBodyPhotoRange(shiftDays(hariIni, -364), hariIni);
  const createPhoto = useCreateBodyPhoto();
  const deletePhoto = useDeleteBodyPhoto();
  const picker = usePhotoPicker();

  const pinggangHariIni = useMeasurementDate(dipilih);
  const simpanPinggang = useSaveMeasurement();

  const [depan, setDepan] = useState<string | null>(null);
  const [samping, setSamping] = useState<string | null>(null);
  const [pinggang, setPinggang] = useState('');
  const [pinggangDisentuh, setPinggangDisentuh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesanPinggang, setPesanPinggang] = useState<string | null>(null);

  /**
   * Isian dilepas saat pindah tanggal, disetel ulang saat render dan bukan
   * lewat useEffect. Tanpa ini foto untuk hari ini ikut terbawa dan tersimpan
   * ke tanggal yang salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(dipilih);
  if (dipilih !== tanggalTerakhir) {
    setTanggalTerakhir(dipilih);
    setDepan(null);
    setSamping(null);
    setPinggang('');
    setPinggangDisentuh(false);
    setError(null);
    setPesanPinggang(null);
  }

  // Pinggang yang sudah tercatat untuk tanggal itu dibuka di kolomnya, supaya
  // user menyunting, bukan mengetik ulang dari nol.
  const pinggangTampil =
    pinggangDisentuh || !pinggangHariIni.data
      ? pinggang
      : String(toNum(pinggangHariIni.data.waist_cm) ?? '');

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

  const simpanUkuran = () => {
    const angka = Number(pinggangTampil.replace(',', '.'));

    if (!Number.isFinite(angka) || angka < 30 || angka > 300) {
      setPesanPinggang('Isi lingkar pinggang antara 30 dan 300 cm');
      return;
    }

    simpanPinggang.mutate(
      { waist_cm: angka, logged_at: dipilih },
      {
        onSuccess: () => setPesanPinggang('Lingkar pinggang tersimpan'),
        onError: (e) => setPesanPinggang(toApiError(e).message),
      },
    );
  };

  /** Id foto yang sedang ditanyakan konfirmasi hapusnya. */
  const [akanDihapus, setAkanDihapus] = useState<string | null>(null);

  const sudahHariIni = today.data !== null && today.data !== undefined;

  return (
    <Screen refreshing={riwayat.isRefetching} onRefresh={() => void riwayat.refetch()}>
      <Header
        title="Foto badan & pinggang"
        subtitle={sudahHariIni ? 'Sudah difoto ' + dayPhrase(dipilih) : 'Cukup 2-4 minggu sekali'}
      />

      <DateStrip value={dipilih} onChange={setDipilih} />

      <Card variant="outline" padding="md">
        <Text variant="caption" tone="secondary">
          Foto di tempat, jarak, dan pencahayaan yang sama setiap kali. Perubahan bentuk badan baru
          terlihat kalau kondisinya konsisten, dan baru terasa setelah beberapa minggu.
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

      {/*
        Lingkar pinggang, angka keras yang mendampingi foto. Dari semua lingkar
        badan cuma ini yang punya bukti kuat, dan cuma ini yang berguna saat
        timbangan macet: berat diam dua minggu tapi pinggang turun 2 cm berarti
        tetap maju, cuma airnya yang naik-turun.
      */}
      <Card>
        <View style={styles.pinggangCard}>
          <View style={styles.pinggangHead}>
            <RulerIcon size={18} color={metricColors.measurement} weight="duotone" />
            <Text variant="label">Lingkar pinggang {dayPhrase(dipilih)}</Text>
          </View>

          <Input
            value={pinggangTampil}
            onChangeText={(v) => {
              setPinggang(v);
              setPinggangDisentuh(true);
              setPesanPinggang(null);
            }}
            placeholder="90"
            keyboardType="decimal-pad"
            suffix="cm"
            hint="Ukur setinggi pusar, sebelum makan, pita tidak menekan kulit. Angka ini pengukuran betulan, bukan tebakan."
          />

          {pesanPinggang ? (
            <Text
              variant="caption"
              tone={pesanPinggang === 'Lingkar pinggang tersimpan' ? 'success' : 'warning'}
            >
              {pesanPinggang}
            </Text>
          ) : null}

          <Button
            label={pinggangHariIni.data ? 'Perbarui pinggang' : 'Simpan pinggang'}
            variant="secondary"
            onPress={simpanUkuran}
            loading={simpanPinggang.isPending}
            disabled={pinggangTampil.trim() === ''}
          />
        </View>
      </Card>

      <Perbandingan tanggalTersedia={(riwayat.data ?? []).map((f) => f.logged_at)} />

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
                      Yang terlihat
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

/**
 * Perbandingan dua tanggal berdampingan.
 *
 * Inilah fungsi asli progress photo: user melihat sendiri foto bulan ini di
 * samping foto bulan lalu, dengan lingkar pinggang di bawahnya sebagai angka
 * kerasnya. Deterministik, tanpa AI.
 *
 * Kesan AI di bawahnya cuma suara kedua: kalimat, bukan angka, dipanggil hanya
 * saat tombolnya ditekan, dan disimpan supaya riwayat pendapatnya bisa dibaca
 * urut. Model memang bisa salah, dan justru karena itu yang menilai tetap
 * mata user sendiri.
 */
const Perbandingan = ({ tanggalTersedia }: { tanggalTersedia: string[] }) => {
  // Riwayat datang urut naik; yang terbaru jadi "sesudah", yang sebelumnya
  // jadi "sebelum" bawaan.
  const urut = [...tanggalTersedia].sort();
  const terbaru = urut[urut.length - 1] ?? null;
  const sebelumnya = urut.length >= 2 ? (urut[urut.length - 2] ?? null) : null;

  const [dari, setDari] = useState<string | null>(null);
  const [ke, setKe] = useState<string | null>(null);

  const from = dari ?? sebelumnya;
  const to = ke ?? terbaru;

  const tampilan = useBodyComparison(from, to);
  const minta = useRequestComparison();
  const [error, setError] = useState<string | null>(null);

  if (urut.length < 2) {
    return (
      <>
        <SectionHeader title="Bandingkan" />
        <Card variant="outline" padding="md">
          <Text variant="caption" tone="tertiary">
            Perbandingan muncul setelah ada foto di dua tanggal berbeda. Foto berikutnya 2-4 minggu
            lagi, di tempat dan pencahayaan yang sama.
          </Text>
        </Card>
      </>
    );
  }

  const d = tampilan.data;
  const pendapat = d?.comparison ?? null;

  const pinggang = (nilai: string | null) => {
    const angka = toNum(nilai);
    return angka === null ? 'pinggang belum diukur' : `pinggang ${angka} cm`;
  };

  return (
    <>
      <SectionHeader title="Bandingkan" />

      <Card>
        <View style={styles.bandingCard}>
          <View style={styles.pilihTanggal}>
            <Text variant="caption" tone="tertiary">
              Sebelum
            </Text>
            <View style={styles.chipBaris}>
              {urut
                .filter((t) => to === null || t < to)
                .map((t) => (
                  <Chip
                    key={t}
                    label={shortDate(t)}
                    size="sm"
                    active={t === from}
                    onPress={() => setDari(t)}
                  />
                ))}
            </View>

            <Text variant="caption" tone="tertiary">
              Sesudah
            </Text>
            <View style={styles.chipBaris}>
              {urut
                .filter((t) => from === null || t > from)
                .map((t) => (
                  <Chip
                    key={t}
                    label={shortDate(t)}
                    size="sm"
                    active={t === to}
                    onPress={() => setKe(t)}
                  />
                ))}
            </View>
          </View>

          {tampilan.isPending ? (
            <Loading />
          ) : d ? (
            <>
              {/* Depan: sebelum | sesudah */}
              <View style={styles.bandingBaris}>
                <View style={styles.bandingSisi}>
                  <RemoteImage
                    path={d.from.photo?.front_photo_url ?? null}
                    style={styles.bandingImage}
                    aspectRatio={3 / 4}
                    accessibilityLabel="Tampak depan, sebelum"
                  />
                  <Text variant="caption" tone="secondary">
                    {shortDate(d.from.date)}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {pinggang(d.from.waist_cm)}
                  </Text>
                </View>
                <View style={styles.bandingSisi}>
                  <RemoteImage
                    path={d.to.photo?.front_photo_url ?? null}
                    style={styles.bandingImage}
                    aspectRatio={3 / 4}
                    accessibilityLabel="Tampak depan, sesudah"
                  />
                  <Text variant="caption" tone="secondary">
                    {shortDate(d.to.date)}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {pinggang(d.to.waist_cm)}
                  </Text>
                </View>
              </View>

              {/* Samping: sebelum | sesudah */}
              <View style={styles.bandingBaris}>
                <RemoteImage
                  path={d.from.photo?.side_photo_url ?? null}
                  style={styles.bandingImage}
                  aspectRatio={3 / 4}
                  accessibilityLabel="Tampak samping, sebelum"
                />
                <RemoteImage
                  path={d.to.photo?.side_photo_url ?? null}
                  style={styles.bandingImage}
                  aspectRatio={3 / 4}
                  accessibilityLabel="Tampak samping, sesudah"
                />
              </View>

              {pendapat ? (
                <View style={styles.pendapat}>
                  <View style={styles.pendapatHead}>
                    <SparkleIcon size={16} color={colors.primary} weight="duotone" />
                    <Text variant="label">{ARAH_LABEL[pendapat.direction]}</Text>
                  </View>
                  <Text variant="caption" tone="secondary">
                    {pendapat.opinion}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    Kesan AI dari foto. Pendapat, bukan pengukuran. Yang menentukan tetap matamu dan
                    pita di pinggang.
                  </Text>
                </View>
              ) : null}

              {error ? <ErrorNote message={error} /> : null}

              <Button
                label={pendapat ? 'Minta kesan AI lagi' : 'Minta kesan AI'}
                variant="secondary"
                onPress={() => {
                  if (!from || !to) return;
                  setError(null);
                  minta.mutate({ from, to }, { onError: (e) => setError(toApiError(e).message) });
                }}
                loading={minta.isPending}
                disabled={!d.from.photo || !d.to.photo}
              />
            </>
          ) : null}
        </View>
      </Card>
    </>
  );
};

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', gap: spacing.md },
  analyzing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  analyzingText: { flex: 1 },
  pinggangCard: { gap: spacing.md },
  pinggangHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bandingCard: { gap: spacing.md },
  pilihTanggal: { gap: spacing.sm },
  chipBaris: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  bandingBaris: { flexDirection: 'row', gap: spacing.sm },
  bandingSisi: { flex: 1, gap: 2 },
  // aspectRatio lewat prop RemoteImage, bukan di sini. Lihat catatan di sana.
  bandingImage: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  pendapat: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pendapatHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
