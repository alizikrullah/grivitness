import { ForkKnifeIcon, SparkleIcon, WarningCircleIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FoodEditSheet } from '@/components/features/FoodEditSheet';
import {
  barisDariScan,
  barisKosong,
  type FoodItemDraft,
  FoodItemsEditor,
  perluDibaca,
  susunItem,
} from '@/components/features/FoodItemsEditor';
import { LogActions } from '@/components/features/LogActions';
import { RemoteImage } from '@/components/features/RemoteImage';
import { MacroBar } from '@/components/features/Metrics';
import { PhotoSlot } from '@/components/features/PhotoSlot';
import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  ChipGroup,
  ConfirmDialog,
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
import { useTanggalAwal } from '@/hooks/useTanggalAwal';
import { toApiError } from '@/lib/api';
import {
  type FoodItemInput,
  useCreateFood,
  useDeleteFood,
  useFoodDate,
  useScanFood,
  useSetFoodDayStatus,
  useUpdateFood,
} from '@/services/food.service';
import { useDailySummary } from '@/services/misc.service';
import type { FoodItem, FoodLog, FoodPhotoCheck, MealType } from '@/types';
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
  const [tanggal, setTanggal] = useState(useTanggalAwal());
  const hariIni = tanggal === todayWIB();

  const today = useFoodDate(tanggal);
  const ringkasan = useDailySummary(tanggal);
  const createFood = useCreateFood();
  const scanFood = useScanFood();
  const deleteFood = useDeleteFood();
  const updateFood = useUpdateFood();
  const statusHari = useSetFoodDayStatus();
  const picker = usePhotoPicker();

  const [uri, setUri] = useState<string | null>(null);
  const [jenis, setJenis] = useState<MealType>(tebakJenisMakan());
  const [items, setItems] = useState<FoodItemDraft[]>([barisKosong()]);
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<FoodLog | null>(null);
  /** Item yang angka kemasannya janggal, menunggu keputusan "Simpan tetap". */
  const [janggal, setJanggal] = useState<{ nama: string[]; items: FoodItemInput[] } | null>(null);
  /** Hasil pemeriksaan foto saat dibaca. Null berarti fotonya belum dibaca. */
  const [cekFoto, setCekFoto] = useState<FoodPhotoCheck | null>(null);
  /** Pembacaan gagal: user tetap bisa mengisi sendiri, Simpan tidak boleh mengulanginya. */
  const [bacaGagal, setBacaGagal] = useState(false);

  const sibuk = createFood.isPending || scanFood.isPending;

  const gantiFoto = (hasil: string | null) => {
    setUri(hasil);
    setCekFoto(null);
    setBacaGagal(false);
    setError(null);
  };

  const ambil = async (dari: 'kamera' | 'galeri') => {
    const hasil = dari === 'kamera' ? await picker.dariKamera() : await picker.dariGaleri();
    if (hasil) gantiFoto(hasil);
  };

  /**
   * Foto jadi isian form, belum ada yang tersimpan: sama seperti "Isi dari
   * screenshot" di layar olahraga. Baris yang sudah ditulis user dijawab per
   * baris tanpa disentuh namanya; form kosong diisi dari yang terlihat.
   */
  const isiDariFoto = () => {
    if (uri === null) return;

    const tertulis = items.filter((i) => i.name.trim() !== '');
    const susunan = susunItem(tertulis, false);
    const adaTulisan = tertulis.length > 0;

    if (adaTulisan && 'error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    scanFood.mutate(
      { uri, items: adaTulisan && 'items' in susunan ? susunan.items : undefined },
      {
        onSuccess: ({ items: hasil, ...cek }) => {
          setCekFoto(cek);
          setItems(
            adaTulisan
              ? tertulis.map((baris, i) => {
                  const h = hasil[i];
                  return h ? barisDariScan(baris, h) : baris;
                })
              : hasil.map((h) => barisDariScan(barisKosong(), h)),
          );
        },
        onError: (e) => {
          setBacaGagal(true);
          setError(toApiError(e).message);
        },
      },
    );
  };

  const simpan = () => {
    // Foto yang belum dibaca mengisi form dulu, bukan langsung tersimpan.
    if (uri !== null && cekFoto === null && !bacaGagal && perluDibaca(items)) {
      isiDariFoto();
      return;
    }

    // Tanpa foto tidak ada yang bisa menaksir berat, jadi beratnya wajib.
    const susunan = susunItem(items, uri === null);

    if ('error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    // Kalori kemasan yang tidak cocok dengan makronya ditanyakan dulu, bukan
    // ditolak: bisa jadi user memang benar dan labelnya yang aneh.
    if (susunan.janggal.length > 0) {
      setJanggal({ nama: susunan.janggal, items: susunan.items });
      return;
    }

    kirim(susunan.items);
  };

  const kirim = (siap: FoodItemInput[]) => {
    createFood.mutate(
      {
        uri,
        meal_type: jenis,
        items: siap,
        // Saat menelusuri hari lampau, makanan dicatat ke tanggal ITU, bukan ke
        // hari ini. Tengah hari dipakai sebagai jam netral karena jam
        // sesungguhnya sudah tidak bisa diingat lagi.
        logged_at: hariIni ? undefined : wibToISO(tanggal, '12:00'),
        scan: cekFoto ?? undefined,
      },
      {
        onSuccess: () => {
          gantiFoto(null);
          setItems([barisKosong()]);
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <>
      <Screen>
        <Header title="Makanan" subtitle="Tulis makananmu, atau isi dari foto" />

        <DateNav value={tanggal} onChange={setTanggal} section="food" />

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

        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Foto (opsional)
          </Text>
          <View style={styles.photoRow}>
            <PhotoSlot
              uri={uri}
              label="Foto makanan"
              onCamera={() => void ambil('kamera')}
              onGallery={() => void ambil('galeri')}
              onClear={() => gantiFoto(null)}
              aspectRatio={4 / 3}
              disabled={picker.sibuk || sibuk}
            />
          </View>
          {uri !== null && cekFoto === null ? (
            <Button
              label={scanFood.isPending ? 'Membaca foto...' : 'Isi dari foto'}
              variant="secondary"
              icon={<SparkleIcon size={18} color={colors.textPrimary} weight="bold" />}
              onPress={isiDariFoto}
              loading={scanFood.isPending}
              disabled={sibuk}
            />
          ) : null}
        </View>

        {/*
          Daftar makanan di form adalah sumber kebenarannya, siapa pun yang
          mengisinya. Foto mengisi form, tidak pernah langsung tersimpan: dulu
          hasil analisa baru bisa dibetulkan setelah tersimpan.
        */}
        <FoodItemsEditor
          items={items}
          onChange={setItems}
          beratWajib={uri === null}
          disabled={sibuk}
        />

        {/*
          Tulisan menang atas foto, tapi kalau model melihat makanan yang jelas
          berbeda, user diberi tahu sebelum menyimpan.
        */}
        {cekFoto?.photo_matches === false && !cekFoto.photo_dismissed ? (
          <View style={styles.peringatan}>
            <WarningCircleIcon size={16} color={colors.warning} weight="duotone" />
            <Text variant="caption" tone="warning" style={styles.peringatanText}>
              Foto terlihat berbeda dari yang ditulis.
              {cekFoto.photo_note ? ' ' + cekFoto.photo_note : ''}
            </Text>
            <Button
              label="Abaikan"
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => setCekFoto({ ...cekFoto, photo_dismissed: true })}
            />
          </View>
        ) : null}

        {cekFoto?.confidence === 'low' ? (
          <Text variant="caption" tone="warning">
            AI kurang yakin dengan foto ini. Periksa lagi nama dan beratnya.
          </Text>
        ) : null}

        {error ? <ErrorNote message={error} /> : null}

        {sibuk ? (
          <Card variant="outline" padding="md">
            <View style={styles.analyzing}>
              <SparkleIcon size={20} color={colors.primary} weight="duotone" />
              <Text variant="caption" tone="secondary" style={styles.analyzingText}>
                {scanFood.isPending
                  ? 'Membaca makanan dari foto. Ini bisa memakan waktu sampai satu menit.'
                  : 'Menyimpan catatanmu. Sebentar.'}
              </Text>
            </View>
          </Card>
        ) : null}

        <Button label="Simpan" onPress={simpan} loading={createFood.isPending} size="lg" />

        <SectionHeader
          title={'Makan ' + dayPhrase(tanggal)}
          action={
            <Text variant="caption" tone="tertiary">
              {thousands(today.data?.total_calories ?? 0)} kkal
            </Text>
          }
        />

        {/*
          Hari yang sudah lewat dengan makan di bawah separuh jatah ditanya:
          belum lengkap atau memang segini. Hari belum lengkap tidak ikut
          rata-rata riwayat, chat, maupun TDEE terukur, karena separuh catatan
          bukan separuh makan. Jawabannya bisa diubah kapan saja.
        */}
        {!hariIni && ringkasan.data?.food_low && ringkasan.data.food_day_status === null ? (
          <Card variant="outline" padding="md">
            <View style={styles.tanya}>
              <Text variant="label">Catatan makan {dayPhrase(tanggal)} sudah lengkap?</Text>
              <Text variant="caption" tone="secondary">
                Tercatat {thousands(ringkasan.data.calories_in)} kkal, di bawah separuh jatahmu{' '}
                {thousands(ringkasan.data.calorie_budget ?? 0)} kkal. Kalau ada yang lupa dicatat,
                hari itu tidak ikut rata-rata supaya defisitmu tidak terlihat lebih besar dari
                kenyataan.
              </Text>
              <View style={styles.tanyaTombol}>
                <Button
                  label="Belum lengkap"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  loading={statusHari.isPending}
                  onPress={() => statusHari.mutate({ date: tanggal, status: 'INCOMPLETE' })}
                />
                <Button
                  label="Memang segini"
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  onPress={() => statusHari.mutate({ date: tanggal, status: 'COMPLETE' })}
                />
              </View>
            </View>
          </Card>
        ) : null}

        {!hariIni && today.data?.day_status ? (
          <View style={styles.statusHari}>
            <Text
              variant="caption"
              tone={today.data.day_status === 'INCOMPLETE' ? 'warning' : 'tertiary'}
            >
              {today.data.day_status === 'INCOMPLETE'
                ? 'Ditandai belum lengkap, tidak ikut rata-rata.'
                : 'Ditandai lengkap.'}
            </Text>
            <Button
              label={
                today.data.day_status === 'INCOMPLETE' ? 'Tandai lengkap' : 'Tandai belum lengkap'
              }
              variant="ghost"
              size="sm"
              fullWidth={false}
              loading={statusHari.isPending}
              onPress={() =>
                statusHari.mutate({
                  date: tanggal,
                  status: today.data?.day_status === 'INCOMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
                })
              }
            />
          </View>
        ) : null}

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
                {/*
                  Gula ikut di batang, digambar di dalam karbo karena memang
                  bagiannya. Perbandingannya dengan batas harian ada di kartu
                  overview beranda.
                */}
                <MacroBar
                  protein={today.data?.total_protein_g ?? 0}
                  carbs={today.data?.total_carbs_g ?? 0}
                  fat={today.data?.total_fat_g ?? 0}
                  sugar={today.data?.total_sugar_g ?? 0}
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

                        {/* Urutan tabel gizi kemasan: lemak, protein, karbo, gula. */}
                        <Text variant="caption" tone="tertiary">
                          {timeWIB(log.logged_at)} WIB · L {toNum(log.fat_g)?.toFixed(0) ?? 0}g · P{' '}
                          {toNum(log.protein_g)?.toFixed(0) ?? 0}g · K{' '}
                          {toNum(log.carbs_g)?.toFixed(0) ?? 0}g
                          {log.sugar_g === null
                            ? ''
                            : ' · G ' + (toNum(log.sugar_g)?.toFixed(0) ?? '0') + 'g'}
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
                        <Button
                          label="Abaikan"
                          variant="ghost"
                          size="sm"
                          fullWidth={false}
                          loading={updateFood.isPending && updateFood.variables?.id === log.id}
                          onPress={() =>
                            updateFood.mutate({ id: log.id, dismiss_photo_note: true })
                          }
                        />
                      </View>
                    ) : log.photo_url && analisa?.photo_matches === null ? (
                      // Semua item dari kemasan atau catatan: model tidak
                      // dipanggil, jadi fotonya tersimpan tapi tidak dilihat.
                      <Text variant="caption" tone="tertiary">
                        Foto tidak diperiksa: semua angka dari kemasan atau catatanmu.
                      </Text>
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
                              {item.nutrition_source === 'LABEL'
                                ? (item.weight_per_portion > 0 ? ringkasJumlah(item) + ' · ' : '') +
                                  'kemasan'
                                : item.nutrition_source === 'PREVIOUS'
                                  ? ringkasJumlah(item) + ' · dari catatan'
                                  : ringkasJumlah(item)}
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

      <ConfirmDialog
        visible={janggal !== null}
        title="Angka kemasan janggal"
        message={
          'Kalori ' +
          (janggal?.nama.join(', ') ?? '') +
          ' tidak cocok dengan protein, karbo, dan lemaknya. Biasanya ini salah baca baris di tabel gizi. Periksa lagi, atau simpan apa adanya kalau memang begitu tertulis.'
        }
        confirmLabel="Simpan tetap"
        cancelLabel="Periksa lagi"
        destructive={false}
        onCancel={() => setJanggal(null)}
        onConfirm={() => {
          const siap = janggal?.items;
          setJanggal(null);
          if (siap) kirim(siap);
        }}
      />
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
  peringatan: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tanya: { gap: spacing.sm },
  tanyaTombol: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statusHari: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
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
