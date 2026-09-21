import { ForkKnifeIcon, SparkleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { AuthImage } from '@/components/features/AuthImage';
import {
  barisKosong,
  type FoodItemDraft,
  FoodItemsEditor,
  susunItem,
} from '@/components/features/FoodItemsEditor';
import { PhotoPicker } from '@/components/features/PhotoPicker';
import {
  Button,
  Card,
  ChipGroup,
  DateField,
  EmptyState,
  ErrorNote,
  Loading,
  Modal,
  SectionHeader,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import { useCreateFood, useDeleteFood, useFoodDate, useUpdateFood } from '@/services/food.service';
import type { FoodItem, FoodLog, MealType } from '@/types';
import { dayPhrase, timeWIB, todayWIB, wibToISO } from '@/utils/date';
import { thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

/** "2 × 150 g" atau "250 ml" kalau porsinya satu. */
const ringkasJumlah = (item: FoodItem): string =>
  (item.portions === 1 ? '' : `${item.portions} × `) +
  `${thousands(item.weight_per_portion)} ${item.unit}`;

export const FoodPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());
  const hariIni = tanggal === todayWIB();

  const today = useFoodDate(tanggal);
  const create = useCreateFood();
  const hapus = useDeleteFood();

  const [file, setFile] = useState<File | null>(null);
  const [jenis, setJenis] = useState<MealType>('LUNCH');
  const [items, setItems] = useState<FoodItemDraft[]>([barisKosong()]);
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<FoodLog | null>(null);

  const simpan = () => {
    // Tanpa foto tidak ada yang bisa menaksir berat, jadi beratnya wajib.
    const susunan = susunItem(items, file === null);

    if ('error' in susunan) {
      setError(susunan.error);
      return;
    }

    setError(null);

    create.mutate(
      {
        file,
        meal_type: jenis,
        items: susunan.items,
        // Saat menelusuri hari lampau, makanan dicatat ke tanggal ITU. Tengah
        // hari dipakai sebagai jam netral karena jam sesungguhnya sudah tidak
        // bisa diingat lagi.
        logged_at: hariIni ? undefined : wibToISO(tanggal, '12:00'),
      },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          setFile(null);
          setItems([barisKosong()]);
        },
      },
    );
  };

  return (
    <>
      <SectionHeader title="Catat makanan" />

      <DateField value={tanggal} onChange={setTanggal} />

      <Card>
        <div className="stack">
          <ChipGroup options={MEAL_OPTIONS} value={jenis} onChange={setJenis} labels={MEAL_LABEL} />

          {/*
            Daftar makanan yang ditulis user adalah sumber kebenarannya. Foto
            cuma pelengkap untuk menaksir berat yang dikosongkan. Dulu terbalik:
            foto wajib, tulisan opsional, dan jumlah porsi diabaikan model.
          */}
          <FoodItemsEditor
            items={items}
            onChange={setItems}
            beratWajib={file === null}
            disabled={create.isPending}
          />

          <div className="stack-xs">
            <span className="t-label c-secondary">Foto (opsional)</span>
            <span className="t-caption c-tertiary">
              Kalau ada foto, berat yang kamu kosongkan ditaksir dari sana. Tanpa foto, isi
              perkiraan beratnya sendiri.
            </span>
            <div style={{ maxWidth: 260 }}>
              <PhotoPicker label="Foto makanan" file={file} onPick={setFile} />
            </div>
          </div>

          {error ? <ErrorNote message={error} /> : null}

          {/* Analisa Groq bisa memakan puluhan detik, jadi keadaan memuatnya
              dijelaskan, bukan cuma tombol berputar tanpa keterangan. */}
          {create.isPending ? (
            <span className="t-caption c-secondary">
              {file
                ? 'Menaksir berat dan gizinya dari foto… ini bisa sampai satu menit.'
                : 'Mengambil nilai gizinya… sebentar.'}
            </span>
          ) : null}

          <Button
            label={file ? 'Analisa dan simpan' : 'Hitung dan simpan'}
            size="lg"
            full
            onClick={simpan}
            loading={create.isPending}
            icon={<SparkleIcon size={16} weight="fill" />}
          />
        </div>
      </Card>

      <SectionHeader title={'Makan ' + dayPhrase(tanggal)} />

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
            <div className="row-between">
              <span className="t-caption c-secondary">{'Total ' + dayPhrase(tanggal)}</span>
              <span className="t-h3 c-accent">
                {thousands(today.data?.total_calories ?? 0)} kkal
              </span>
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

                    <span className="t-caption c-secondary">
                      P {Math.round(toNum(log.protein_g) ?? 0)}g · K{' '}
                      {Math.round(toNum(log.carbs_g) ?? 0)}g · L {Math.round(toNum(log.fat_g) ?? 0)}
                      g
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
                      </div>
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
    </>
  );
};

/**
 * Mengoreksi sesi makan tanpa memanggil AI lagi.
 *
 * Nilai gizi per 100 tiap item sudah tersimpan, jadi mengubah nama, jumlah,
 * atau berat cukup dihitung ulang backend. Berat wajib di sini: tidak ada
 * foto yang dianalisa ulang untuk menaksirnya. Menambah makanan dimatikan,
 * makanan baru adalah sesi baru.
 */
const FoodEditModal = ({ log, onClose }: { log: FoodLog; onClose: () => void }) => {
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
        Kalorinya dihitung ulang tanpa memanggil AI lagi. Kalau taksiran AI meleset dan kemasannya
        ada, buka bagian Dari kemasan dan isi angkanya, itu yang dipakai. Untuk makanan yang belum
        ada di daftar, catat sebagai sesi baru.
      </span>

      {error ? <ErrorNote message={error} /> : null}
    </Modal>
  );
};
