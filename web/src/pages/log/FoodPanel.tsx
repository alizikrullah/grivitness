import { ForkKnifeIcon, SparkleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { AuthImage } from '@/components/features/AuthImage';
import { PhotoPicker } from '@/components/features/PhotoPicker';
import { Button, Card, ChipGroup, EmptyState, ErrorNote, Input, Loading, Modal, SectionHeader } from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { MEAL_LABEL, MEAL_OPTIONS } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import { useCreateFood, useDeleteFood, useFoodToday, useUpdateFood } from '@/services/food.service';
import type { FoodLog, MealType } from '@/types';
import { timeWIB } from '@/utils/date';
import { thousands, toNum } from '@/utils/format';
import { LogActions } from './LogActions';

export const FoodPanel = () => {
  const today = useFoodToday();
  const create = useCreateFood();
  const hapus = useDeleteFood();

  const [file, setFile] = useState<File | null>(null);
  const [jenis, setJenis] = useState<MealType>('LUNCH');
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<FoodLog | null>(null);

  const simpan = () => {
    setError(null);

    if (!file) {
      setError('Pilih foto makanannya dulu');
      return;
    }

    create.mutate(
      { file, meal_type: jenis, notes: catatan.trim() || undefined },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          setFile(null);
          setCatatan('');
        },
      },
    );
  };

  return (
    <>
      <SectionHeader title="Catat makanan" />

      <Card>
        <div className="stack">
          <div style={{ maxWidth: 260 }}>
            <PhotoPicker label="Foto makanan" file={file} onPick={setFile} />
          </div>

          <ChipGroup
            options={MEAL_OPTIONS}
            value={jenis}
            onChange={setJenis}
            labels={MEAL_LABEL}
          />

          <Input
            label="Catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Contoh: sate lontong dengan bumbu kacang"
            hint="Catatan ini dikirim ke AI dan dianggap benar soal APA makanannya — foto cuma dipakai menakar porsinya."
          />

          {error ? <ErrorNote message={error} /> : null}

          {/* Analisa Groq bisa memakan puluhan detik, jadi keadaan memuatnya
              dijelaskan — bukan cuma tombol berputar tanpa keterangan. */}
          {create.isPending ? (
            <span className="t-caption c-secondary">
              Menganalisa foto… ini bisa sampai satu menit.
            </span>
          ) : null}

          <Button
            label="Analisa dan simpan"
            size="lg"
            full
            onClick={simpan}
            loading={create.isPending}
            icon={<SparkleIcon size={16} weight="fill" />}
          />
        </div>
      </Card>

      <SectionHeader title="Makan hari ini" />

      {today.isPending ? (
        <Loading />
      ) : (today.data?.logs.length ?? 0) === 0 ? (
        <EmptyState
          icon={<ForkKnifeIcon size={28} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada catatan makan"
          message="Foto makananmu dan biarkan AI menghitung kalorinya."
        />
      ) : (
        <>
          <Card padding="md">
            <div className="row-between">
              <span className="t-caption c-secondary">Total hari ini</span>
              <span className="t-h3 c-accent">
                {thousands(today.data?.total_calories ?? 0)} kkal
              </span>
            </div>
          </Card>

          <div className="grid-2">
            {today.data?.logs.map((log) => (
              <Card key={log.id} padding="md">
                <div className="stack-sm">
                  <AuthImage path={log.photo_url} alt={MEAL_LABEL[log.meal_type]} height={160} />

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
                    {Math.round(toNum(log.carbs_g) ?? 0)}g · L {Math.round(toNum(log.fat_g) ?? 0)}g
                  </span>

                  {log.ai_analysis.foods_detected?.length ? (
                    <span className="t-caption c-tertiary">
                      {log.ai_analysis.foods_detected.join(', ')}
                    </span>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {diedit ? <FoodEditModal log={diedit} onClose={() => setDiedit(null)} /> : null}
    </>
  );
};

/**
 * Mengoreksi hasil AI tanpa memotret ulang.
 *
 * AI sering meleset pada hidangan yang mirip. Tanpa jalur ini, satu-satunya
 * cara membetulkannya adalah menghapus lalu mencatat dari awal — yang berarti
 * satu panggilan AI lagi, dan satu langkah lebih dekat ke batas kuota Groq,
 * hanya untuk memperbaiki satu kata.
 */
const FoodEditModal = ({ log, onClose }: { log: FoodLog; onClose: () => void }) => {
  const update = useUpdateFood();

  const [kalori, setKalori] = useState(String(log.total_calories));
  const [protein, setProtein] = useState(String(Math.round(toNum(log.protein_g) ?? 0)));
  const [karbo, setKarbo] = useState(String(Math.round(toNum(log.carbs_g) ?? 0)));
  const [lemak, setLemak] = useState(String(Math.round(toNum(log.fat_g) ?? 0)));
  const [makanan, setMakanan] = useState((log.ai_analysis.foods_detected ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    update.mutate(
      {
        id: log.id,
        total_calories: Number(kalori) || 0,
        protein_g: Number(protein) || 0,
        carbs_g: Number(karbo) || 0,
        fat_g: Number(lemak) || 0,
        foods_detected: makanan
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
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
      <Input
        label="Daftar makanan"
        value={makanan}
        onChange={(e) => setMakanan(e.target.value)}
        hint="Pisahkan dengan koma"
      />

      <Input
        label="Kalori"
        inputMode="numeric"
        value={kalori}
        onChange={(e) => setKalori(e.target.value.replace(/[^0-9]/g, ''))}
        suffix="kkal"
      />

      <div className="grid-3">
        <Input
          label="Protein"
          inputMode="numeric"
          value={protein}
          onChange={(e) => setProtein(e.target.value.replace(/[^0-9]/g, ''))}
          suffix="g"
        />
        <Input
          label="Karbo"
          inputMode="numeric"
          value={karbo}
          onChange={(e) => setKarbo(e.target.value.replace(/[^0-9]/g, ''))}
          suffix="g"
        />
        <Input
          label="Lemak"
          inputMode="numeric"
          value={lemak}
          onChange={(e) => setLemak(e.target.value.replace(/[^0-9]/g, ''))}
          suffix="g"
        />
      </div>

      {error ? <ErrorNote message={error} /> : null}
    </Modal>
  );
};
