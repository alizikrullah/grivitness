import { ForkKnifeIcon, SparkleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { AuthImage } from '@/components/features/AuthImage';
import { MacroStack } from '@/components/features/MacroStack';
import {
  barisDariScan,
  barisKosong,
  type FoodItemDraft,
  FoodItemsEditor,
  perluDibaca,
  susunItem,
} from '@/components/features/FoodItemsEditor';
import { PhotoPicker } from '@/components/features/PhotoPicker';
import { DateNav } from '@/components/features/DateNav';
import {
  Button,
  Card,
  ChipGroup,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Loading,
  Modal,
  SectionHeader,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { useTanggalLog } from '@/hooks/useTanggalLog';
import { toApiError } from '@/lib/api';
import {
  type FoodItemEditInput,
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
import { dayPhrase, timeWIB, todayWIB, wibToISO } from '@/utils/date';
import { thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

/** "2 × 150 g" atau "250 ml" kalau porsinya satu. */
const ringkasJumlah = (item: FoodItem): string =>
  (item.portions === 1 ? '' : `${item.portions} × `) +
  `${thousands(item.weight_per_portion)} ${item.unit}`;

export const FoodPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useTanggalLog();
  const hariIni = tanggal === todayWIB();

  const today = useFoodDate(tanggal);
  const ringkasan = useDailySummary(tanggal);
  const create = useCreateFood();
  const scan = useScanFood();
  const hapus = useDeleteFood();
  const update = useUpdateFood();
  const statusHari = useSetFoodDayStatus();

  const [file, setFile] = useState<File | null>(null);
  const [jenis, setJenis] = useState<MealType>('LUNCH');
  const [items, setItems] = useState<FoodItemDraft[]>([barisKosong()]);
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<FoodLog | null>(null);
  /** Item yang angka kemasannya janggal, menunggu keputusan "Simpan tetap". */
  const [janggal, setJanggal] = useState<{ nama: string[]; items: FoodItemInput[] } | null>(null);
  /** Hasil pemeriksaan foto saat dibaca. Null berarti fotonya belum dibaca. */
  const [cekFoto, setCekFoto] = useState<FoodPhotoCheck | null>(null);
  /** Pembacaan gagal: user tetap bisa mengisi sendiri, Simpan tidak boleh mengulanginya. */
  const [bacaGagal, setBacaGagal] = useState(false);

  const sibuk = create.isPending || scan.isPending;

  const gantiFoto = (baru: File | null) => {
    setFile(baru);
    setCekFoto(null);
    setBacaGagal(false);
    setError(null);
  };

  /**
   * Foto jadi isian form, belum ada yang tersimpan: sama seperti "Isi dari
   * screenshot" di panel olahraga. Baris yang sudah ditulis user dijawab per
   * baris tanpa disentuh namanya; form kosong diisi dari yang terlihat.
   */
  const isiDariFoto = () => {
    if (file === null) return;

    const tertulis = items.filter((i) => i.name.trim() !== '');
    const susunan = susunItem(tertulis, false);
    const adaTulisan = tertulis.length > 0;

    if (adaTulisan && 'error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    scan.mutate(
      { file, items: adaTulisan && 'items' in susunan ? susunan.items : undefined },
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
    if (file !== null && cekFoto === null && !bacaGagal && perluDibaca(items)) {
      isiDariFoto();
      return;
    }

    // Tanpa foto tidak ada yang bisa menaksir berat, jadi beratnya wajib.
    const susunan = susunItem(items, file === null);

    if ('error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    // Kalori kemasan yang tidak cocok dengan makronya ditanyakan dulu, bukan ditolak.
    if (susunan.janggal.length > 0) {
      setJanggal({ nama: susunan.janggal, items: susunan.items });
      return;
    }

    kirim(susunan.items);
  };

  const kirim = (siap: FoodItemInput[]) => {
    create.mutate(
      {
        file,
        meal_type: jenis,
        items: siap,
        // Saat menelusuri hari lampau, makanan dicatat ke tanggal ITU. Tengah
        // hari dipakai sebagai jam netral karena jam sesungguhnya sudah tidak
        // bisa diingat lagi.
        logged_at: hariIni ? undefined : wibToISO(tanggal, '12:00'),
        scan: cekFoto ?? undefined,
      },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          gantiFoto(null);
          setItems([barisKosong()]);
        },
      },
    );
  };

  return (
    <>
      <SectionHeader title="Catat makanan" />

      <DateNav value={tanggal} onChange={setTanggal} section="food" />

      <Card>
        <div className="stack">
          <ChipGroup options={MEAL_OPTIONS} value={jenis} onChange={setJenis} labels={MEAL_LABEL} />

          <div className="stack-xs">
            <span className="t-label c-secondary">Foto (opsional)</span>
            <div style={{ maxWidth: 260 }}>
              <PhotoPicker label="Foto makanan" file={file} onPick={gantiFoto} />
            </div>
            {file !== null && cekFoto === null ? (
              <div>
                <Button
                  label={scan.isPending ? 'Membaca foto…' : 'Isi dari foto'}
                  variant="secondary"
                  onClick={isiDariFoto}
                  loading={scan.isPending}
                  disabled={sibuk}
                  icon={<SparkleIcon size={16} weight="fill" />}
                />
              </div>
            ) : null}
          </div>

          {/*
            Daftar makanan di form adalah sumber kebenarannya, siapa pun yang
            mengisinya. Foto mengisi form, tidak pernah langsung tersimpan: dulu
            hasil analisa baru bisa dibetulkan setelah tersimpan.
          */}
          <FoodItemsEditor
            items={items}
            onChange={setItems}
            beratWajib={file === null}
            disabled={sibuk}
          />

          {cekFoto?.photo_matches === false && !cekFoto.photo_dismissed ? (
            <div className="food-peringatan">
              <WarningCircleIcon size={16} color={colors.warning} weight="duotone" />
              <span className="t-caption c-warning flex-1">
                Foto terlihat berbeda dari yang ditulis.
                {cekFoto.photo_note ? ' ' + cekFoto.photo_note : ''}
              </span>
              <Button
                label="Abaikan"
                variant="ghost"
                size="sm"
                onClick={() => setCekFoto({ ...cekFoto, photo_dismissed: true })}
              />
            </div>
          ) : null}

          {cekFoto?.confidence === 'low' ? (
            <span className="t-caption c-warning">
              AI kurang yakin dengan foto ini. Periksa lagi nama dan beratnya.
            </span>
          ) : null}

          {error ? <ErrorNote message={error} /> : null}

          {/* Pembacaan Groq bisa memakan puluhan detik, jadi keadaan memuatnya
              dijelaskan, bukan cuma tombol berputar tanpa keterangan. */}
          {sibuk ? (
            <span className="t-caption c-secondary">
              {scan.isPending
                ? 'Membaca makanan dari foto… ini bisa sampai satu menit.'
                : 'Menyimpan catatanmu… sebentar.'}
            </span>
          ) : null}

          <Button label="Simpan" size="lg" full onClick={simpan} loading={create.isPending} />
        </div>
      </Card>

      <SectionHeader title={'Makan ' + dayPhrase(tanggal)} />

      {/*
        Hari yang sudah lewat dengan makan di bawah separuh jatah ditanya:
        belum lengkap atau memang segini. Hari belum lengkap tidak ikut
        rata-rata riwayat, chat, maupun TDEE terukur.
      */}
      {!hariIni && ringkasan.data?.food_low && ringkasan.data.food_day_status === null ? (
        <Card variant="outline" padding="md">
          <div className="stack-sm">
            <span className="t-label">Catatan makan {dayPhrase(tanggal)} sudah lengkap?</span>
            <span className="t-caption c-secondary">
              Tercatat {thousands(ringkasan.data.calories_in)} kkal, di bawah separuh jatahmu{' '}
              {thousands(ringkasan.data.calorie_budget ?? 0)} kkal. Kalau ada yang lupa dicatat,
              hari itu tidak ikut rata-rata supaya defisitmu tidak terlihat lebih besar dari
              kenyataan.
            </span>
            <div className="row">
              <Button
                label="Belum lengkap"
                variant="secondary"
                size="sm"
                loading={statusHari.isPending}
                onClick={() => statusHari.mutate({ date: tanggal, status: 'INCOMPLETE' })}
              />
              <Button
                label="Memang segini"
                variant="ghost"
                size="sm"
                onClick={() => statusHari.mutate({ date: tanggal, status: 'COMPLETE' })}
              />
            </div>
          </div>
        </Card>
      ) : null}

      {!hariIni && today.data?.day_status ? (
        <div className="row-between">
          <span
            className={
              't-caption ' + (today.data.day_status === 'INCOMPLETE' ? 'c-warning' : 'c-tertiary')
            }
          >
            {today.data.day_status === 'INCOMPLETE'
              ? 'Ditandai belum lengkap, tidak ikut rata-rata.'
              : 'Ditandai lengkap.'}
          </span>
          <Button
            label={
              today.data.day_status === 'INCOMPLETE' ? 'Tandai lengkap' : 'Tandai belum lengkap'
            }
            variant="ghost"
            size="sm"
            loading={statusHari.isPending}
            onClick={() =>
              statusHari.mutate({
                date: tanggal,
                status: today.data?.day_status === 'INCOMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
              })
            }
          />
        </div>
      ) : null}

      {today.isPending ? (
        <Loading />
      ) : (today.data?.logs.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ForkKnifeIcon size={28} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada catatan makan"
          message="Tulis makananmu di atas, gizinya ditaksir otomatis."
        />
      ) : (
        <>
          <Card padding="md">
            <div className="stack-sm">
              <div className="row-between">
                <span className="t-caption c-secondary">{'Total ' + dayPhrase(tanggal)}</span>
                <span className="t-h3 c-accent">
                  {thousands(today.data?.total_calories ?? 0)} kkal
                </span>
              </div>
              {/*
                Padanan batang gizi mobile, gula di dalam batang karbo.
                Perbandingannya dengan batas harian ada di kartu overview beranda.
              */}
              <MacroStack
                protein={today.data?.total_protein_g ?? 0}
                carbs={today.data?.total_carbs_g ?? 0}
                fat={today.data?.total_fat_g ?? 0}
                sugar={today.data?.total_sugar_g ?? 0}
              />
            </div>
          </Card>

          <div className="grid-2">
            {today.data?.logs.map((log) => {
              const analisa = log.ai_analysis;
              const rincian = analisa?.items ?? [];

              return (
                <Card key={log.id} padding="md">
                  <div className="stack-sm">
                    {log.photo_url ? (
                      <AuthImage
                        path={log.photo_url}
                        alt={MEAL_LABEL[log.meal_type]}
                        height={160}
                      />
                    ) : (
                      <div className="food-thumb-kosong">
                        <ForkKnifeIcon size={28} color={colors.textTertiary} weight="duotone" />
                      </div>
                    )}

                    <div className="row-between">
                      <span className="stack-xs flex-1">
                        <span className="t-label">{MEAL_LABEL[log.meal_type]}</span>
                        <span className="t-caption c-tertiary">{timeWIB(log.logged_at)} WIB</span>
                      </span>

                      <LogActions
                        onEdit={() => setDiedit(log)}
                        onDelete={() =>
                          hapus.mutate(log.id, { onError: (e) => setError(toApiError(e).message) })
                        }
                        confirmMessage="Hapus catatan makan ini?"
                      />
                    </div>

                    <span className="t-h3" style={{ color: metricColors.calories }}>
                      {thousands(log.total_calories)} kkal
                    </span>

                    {/* Urutan tabel gizi kemasan: lemak, protein, karbo, gula. */}
                    <span className="t-caption c-secondary">
                      L {Math.round(toNum(log.fat_g) ?? 0)}g · P{' '}
                      {Math.round(toNum(log.protein_g) ?? 0)}g · K{' '}
                      {Math.round(toNum(log.carbs_g) ?? 0)}g
                      {log.sugar_g === null
                        ? ''
                        : ' · G ' + String(Math.round(toNum(log.sugar_g) ?? 0)) + 'g'}
                    </span>

                    {/*
                      Tulisan menang atas foto, tapi kalau model melihat makanan
                      yang jelas berbeda, user diberi tahu supaya salah pilih
                      foto ketahuan.
                    */}
                    {analisa?.photo_matches === false ? (
                      <div className="food-peringatan">
                        <WarningCircleIcon size={16} color={colors.warning} weight="duotone" />
                        <span className="t-caption c-warning flex-1">
                          Foto terlihat berbeda dari yang ditulis.
                          {analisa.photo_note ? ' ' + analisa.photo_note : ''}
                        </span>
                        <Button
                          label="Abaikan"
                          variant="ghost"
                          size="sm"
                          loading={update.isPending && update.variables?.id === log.id}
                          onClick={() => update.mutate({ id: log.id, dismiss_photo_note: true })}
                        />
                      </div>
                    ) : log.photo_url && analisa?.photo_matches === null ? (
                      // Semua item dari kemasan atau catatan: model tidak
                      // dipanggil, fotonya tersimpan tapi tidak dilihat.
                      <span className="t-caption c-tertiary">
                        Foto tidak diperiksa: semua angka dari kemasan atau catatanmu.
                      </span>
                    ) : null}

                    {/*
                      Rincian per makanan: jumlah × berat per porsi, lalu
                      kalorinya. Ini yang membuat totalnya bisa diperiksa.
                    */}
                    {rincian.length > 0 ? (
                      <div className="food-rincian">
                        {rincian.map((item, i) => (
                          <div key={item.name + i} className="food-rincian-row">
                            <span className="t-caption c-secondary food-rincian-nama">
                              {item.name}
                            </span>
                            <span className="t-caption c-tertiary">
                              {item.nutrition_source === 'LABEL'
                                ? (item.weight_per_portion > 0 ? ringkasJumlah(item) + ' · ' : '') +
                                  'kemasan'
                                : item.nutrition_source === 'PREVIOUS'
                                  ? ringkasJumlah(item) + ' · dari catatan'
                                  : ringkasJumlah(item)}
                            </span>
                            <span
                              className={
                                't-caption food-rincian-kkal' +
                                (item.nutrition_missing ? ' c-warning' : '')
                              }
                            >
                              {item.nutrition_missing
                                ? 'belum ditaksir'
                                : thousands(item.calories) + ' kkal'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {diedit ? <FoodEditModal log={diedit} onClose={() => setDiedit(null)} /> : null}

      <ConfirmDialog
        open={janggal !== null}
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
};

/**
 * Mengoreksi sesi makan. Padanan FoodEditSheet mobile.
 *
 * Porsi dan berat dihitung ulang dari nilai per 100 yang tersimpan, tanpa AI.
 * Nama atau satuan yang diganti berarti makanan lain: item ITU saja yang
 * ditaksir ulang. Tiap baris membawa urutannya di catatan tersimpan
 * (sourceIndex) supaya menghapus item di tengah tidak menggeser gizinya.
 * Menambah makanan dimatikan, makanan baru adalah sesi baru.
 */
const FoodEditModal = ({ log, onClose }: { log: FoodLog; onClose: () => void }) => {
  const update = useUpdateFood();

  const [jenis, setJenis] = useState<MealType>(log.meal_type);
  const [items, setItems] = useState<FoodItemDraft[]>(
    (log.ai_analysis?.items ?? []).map((item, i) => ({
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
      labelSugar: item.label?.sugar_g === undefined ? '' : String(item.label.sugar_g),
      dariCatatan: false,
      sourceIndex: i,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [janggal, setJanggal] = useState<{ nama: string[]; items: FoodItemEditInput[] } | null>(
    null,
  );

  const simpan = () => {
    const susunan = susunItem(items, true);

    if ('error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    if (susunan.janggal.length > 0) {
      setJanggal({ nama: susunan.janggal, items: susunan.items });
      return;
    }

    kirim(susunan.items);
  };

  const kirim = (siap: FoodItemEditInput[]) => {
    update.mutate(
      {
        id: log.id,
        meal_type: jenis,
        items: siap,
      },
      { onError: (e) => setError(toApiError(e).message), onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      title="Koreksi catatan makan"
      onClose={onClose}
      footer={<Button label="Simpan" size="lg" full onClick={simpan} loading={update.isPending} />}
    >
      {/* Fotonya di atas kalau ada, sebagai rujukan untuk menilai berat yang ditaksir. */}
      {log.photo_url ? (
        <AuthImage path={log.photo_url} alt={'Foto ' + MEAL_LABEL[log.meal_type]} height={200} />
      ) : null}

      <ChipGroup options={MEAL_OPTIONS} value={jenis} onChange={setJenis} labels={MEAL_LABEL} />

      <FoodItemsEditor
        items={items}
        onChange={setItems}
        beratWajib
        bisaTambah={false}
        disabled={update.isPending}
      />

      <span className="t-caption c-tertiary">
        Porsi dan berat dihitung ulang tanpa AI. Ganti nama atau satuan berarti makanan lain, dan
        item itu saja yang ditaksir ulang. Kalau taksiran meleset dan kemasannya ada, buka bagian
        Dari kemasan dan isi angkanya. Makanan tambahan dicatat sebagai sesi baru.
      </span>

      {error ? <ErrorNote message={error} /> : null}

      <ConfirmDialog
        open={janggal !== null}
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
    </Modal>
  );
};
