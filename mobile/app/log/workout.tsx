import { BarbellIcon, CaretRightIcon, MagnifyingGlassIcon } from 'phosphor-react-native';
import { LogActions } from '@/components/features/LogActions';
import { WorkoutEditSheet } from '@/components/features/WorkoutEditSheet';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  Row,
  Screen,
  SectionHeader,
  Sheet,
  Stepper,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import {
  CATEGORY_LABEL,
  CATEGORY_OPTIONS,
  INTENSITY_LABEL,
  INTENSITY_OPTIONS,
} from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import {
  useCreateWorkout,
  useCustomWorkouts,
  useDeleteWorkout,
  useWorkoutLibrary,
  useWorkoutsDate,
  type WorkoutInput,
} from '@/services/workouts.service';
import type { WorkoutCategory, WorkoutIntensity, WorkoutLog } from '@/types';
import { useDeviceEnergyDate } from '@/services/device-energy.service';
import { dayPhrase, todayWIB } from '@/utils/date';
import { duration, thousands, toNum } from '@/utils/format';

/** Olahraga yang dipilih user, apa pun sumbernya. */
interface Pilihan {
  id: string;
  name: string;
  sumber: 'library' | 'custom';
  perMenit: number;
}

/** Pilihan pada pertanyaan "terekam smartwatch". */
const REKAM = ['YA', 'TIDAK'] as const;
const REKAM_LABEL = { YA: 'Ya, jam saya pakai', TIDAK: 'Tidak' };

export default function WorkoutScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [tanggal, setTanggal] = useState(todayWIB());
  const hariIni = tanggal === todayWIB();

  const today = useWorkoutsDate(tanggal);
  const createWorkout = useCreateWorkout();
  const deleteWorkout = useDeleteWorkout();

  /**
   * Pertanyaan "terekam smartwatch" hanya relevan kalau hari itu memang ada
   * angka dari perangkat. Tanpa itu kalori olahraga selalu dihitung penuh, dan
   * menanyakannya cuma menambah satu keputusan yang tidak berpengaruh apa-apa.
   */
  const angkaPerangkat = useDeviceEnergyDate(tanggal).data;

  const [sheet, setSheet] = useState(false);
  const [pilihan, setPilihan] = useState<Pilihan | null>(null);
  const [manual, setManual] = useState('');
  const [kaloriManual, setKaloriManual] = useState('');
  const [menit, setMenit] = useState(30);
  const [intensitas, setIntensitas] = useState<WorkoutIntensity>('MEDIUM');
  const [catatan, setCatatan] = useState('');
  const [terekam, setTerekam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<WorkoutLog | null>(null);

  const pakaiManual = pilihan === null;

  const simpan = () => {
    setError(null);

    const body: WorkoutInput = {
      duration_minutes: menit,
      intensity: intensitas,
      notes: catatan.trim() === '' ? undefined : catatan.trim(),
      // Kalau hari itu tidak ada angka perangkat, pertanyaannya tidak muncul di
      // layar, jadi tidak boleh ada nilai yang menyelinap dari sesi sebelumnya.
      tracked_by_device: angkaPerangkat ? terekam : false,
      // Saat menelusuri hari lampau, sesi dicatat ke tanggal ITU.
      logged_at: hariIni ? undefined : tanggal,
    };

    if (pilihan) {
      // Kalori dihitung backend dari durasi dan berat badan user, jadi tidak
      // dikirim dari sini, nilai apa pun yang dikirim client akan diabaikan.
      if (pilihan.sumber === 'library') body.workout_library_id = pilihan.id;
      else body.custom_workout_id = pilihan.id;
    } else {
      const nama = manual.trim();
      const kalori = Number(kaloriManual);

      if (nama.length < 2) {
        setError('Isi nama olahraga, atau pilih dari daftar');
        return;
      }

      if (!Number.isFinite(kalori) || kalori < 0) {
        setError('Isi perkiraan kalori terbakar');
        return;
      }

      body.workout_name = nama;
      body.calories_burned = Math.round(kalori);
    }

    createWorkout.mutate(body, {
      onSuccess: () => {
        setPilihan(null);
        setManual('');
        setKaloriManual('');
        setCatatan('');
        setTerekam(false);
      },
      onError: (e) => setError(toApiError(e).message),
    });
  };

  const perkiraanKalori = pilihan ? Math.round(pilihan.perMenit * menit) : null;

  return (
    <>
      <Screen>
        <Header title="Olahraga" subtitle="Boleh lebih dari satu sesi per hari" />

        <DateStrip value={tanggal} onChange={setTanggal} />

        <Pressable
          onPress={() => setSheet(true)}
          style={({ pressed }) => [styles.picker, pressed && styles.pressed]}
        >
          <View style={[styles.pickerIcon, { backgroundColor: metricColors.workout + '1F' }]}>
            <BarbellIcon size={22} color={metricColors.workout} weight="duotone" />
          </View>

          <View style={styles.pickerText}>
            <Text variant="caption" tone="tertiary">
              Jenis olahraga
            </Text>
            <Text variant="label" numberOfLines={1}>
              {pilihan?.name ?? 'Pilih dari daftar'}
            </Text>
          </View>

          <CaretRightIcon size={18} color={colors.textSecondary} weight="bold" />
        </Pressable>

        {pakaiManual ? (
          <>
            <Input
              label="Atau tulis sendiri"
              value={manual}
              onChangeText={setManual}
              placeholder="Nama olahraga"
              autoCapitalize="sentences"
            />
            <Input
              label="Perkiraan kalori terbakar"
              value={kaloriManual}
              onChangeText={setKaloriManual}
              placeholder="200"
              keyboardType="number-pad"
              suffix="kkal"
              hint="Wajib diisi untuk olahraga yang ditulis sendiri"
            />
          </>
        ) : (
          <Card variant="outline" padding="md">
            <Row
              label="Perkiraan kalori"
              value={thousands(perkiraanKalori ?? 0) + ' kkal'}
              tone="accent"
            />
            <Text variant="caption" tone="tertiary">
              Angka pastinya dihitung ulang backend sesuai berat badan kamu.
            </Text>
          </Card>
        )}

        <Card>
          <View style={styles.durationCard}>
            <Text variant="overline" tone="tertiary" align="center">
              Durasi
            </Text>
            <Stepper value={menit} onChange={setMenit} step={5} min={1} max={1440} suffix="menit" />
          </View>
        </Card>

        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Intensitas
          </Text>
          <ChipGroup
            options={INTENSITY_OPTIONS}
            value={intensitas}
            onChange={setIntensitas}
            labels={INTENSITY_LABEL}
            wrap
          />
        </View>

        {/*
          Muncul HANYA kalau hari itu ada angka kalori dari smartwatch.

          Jawabannya menentukan apakah kalori sesi ini ditambahkan di atas angka
          perangkat atau tidak. Jalan santai dan berkebun yang dilakukan sambil
          memakai jam sudah ikut terhitung di sana, jadi menambahkannya lagi
          berarti menghitung dua kali. Berenang atau sesi yang jamnya dilepas
          belum, jadi memang harus ditambahkan.
        */}
        {angkaPerangkat ? (
          <View style={styles.group}>
            <Text variant="label" tone="secondary">
              Sesi ini terekam smartwatch?
            </Text>
            <ChipGroup
              options={REKAM}
              value={terekam ? 'YA' : 'TIDAK'}
              onChange={(v) => setTerekam(v === 'YA')}
              labels={REKAM_LABEL}
              wrap
            />
            <Text variant="caption" tone="tertiary">
              {'Kalau jawabannya ya, kalorinya sudah termasuk di angka ' +
                thousands(angkaPerangkat.total_kcal) +
                ' kkal dan tidak dihitung lagi.'}
            </Text>
          </View>
        ) : null}

        <Input
          label="Catatan"
          value={catatan}
          onChangeText={setCatatan}
          placeholder="Opsional"
          multiline
          maxLength={1000}
          autoCapitalize="sentences"
        />

        {error ? <ErrorNote message={error} /> : null}

        <Button
          label="Simpan olahraga"
          onPress={simpan}
          loading={createWorkout.isPending}
          size="lg"
        />

        <SectionHeader
          title={dayPhrase(tanggal) === 'hari ini' ? 'Hari ini' : dayPhrase(tanggal)}
          action={
            <Text variant="caption" tone="tertiary">
              {duration(today.data?.total_minutes ?? 0)} ·{' '}
              {thousands(today.data?.total_calories ?? 0)} kkal
            </Text>
          }
        />

        {today.isPending ? (
          <Loading />
        ) : (today.data?.logs.length ?? 0) === 0 ? (
          <EmptyState
            icon={<BarbellIcon size={30} color={colors.textTertiary} weight="duotone" />}
            title="Belum ada olahraga"
            message="Pilih jenis olahraga di atas lalu simpan."
          />
        ) : (
          today.data?.logs.map((log) => (
            <Card key={log.id} padding="md">
              <View style={styles.logRow}>
                <View style={styles.logText}>
                  <Text variant="label" numberOfLines={1}>
                    {log.workout_name}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {duration(log.duration_minutes)} · {thousands(log.calories_burned)} kkal ·{' '}
                    {INTENSITY_LABEL[log.intensity]}
                  </Text>
                  {log.tracked_by_device ? (
                    <Text variant="caption" tone="tertiary">
                      Sudah termasuk di angka smartwatch
                    </Text>
                  ) : null}
                </View>

                <LogActions
                  onEdit={() => setDiedit(log)}
                  onDelete={() => deleteWorkout.mutate(log.id)}
                  deleteMessage={
                    log.workout_name + ' akan dihapus dari catatan ' + dayPhrase(tanggal) + '.'
                  }
                />
              </View>
            </Card>
          ))
        )}

        <WorkoutPicker
          visible={sheet}
          onClose={() => setSheet(false)}
          onPick={(p) => {
            setPilihan(p);
            setSheet(false);
          }}
        />
      </Screen>

      {diedit ? (
        <WorkoutEditSheet key={diedit.id} log={diedit} onClose={() => setDiedit(null)} />
      ) : null}
    </>
  );
}

const WorkoutPicker = ({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (pilihan: Pilihan) => void;
}) => {
  const [kategori, setKategori] = useState<WorkoutCategory | null>(null);
  const [cari, setCari] = useState('');

  const library = useWorkoutLibrary(kategori ?? undefined, cari);
  const custom = useCustomWorkouts();

  const daftar: Pilihan[] = [
    ...(custom.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      sumber: 'custom' as const,
      perMenit: toNum(w.calories_burned_per_minute) ?? 0,
    })),
    ...(library.data ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      sumber: 'library' as const,
      perMenit: toNum(w.calories_burned_per_minute) ?? 0,
    })),
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Pilih olahraga">
      <Input
        value={cari}
        onChangeText={setCari}
        placeholder="Cari olahraga"
        icon={<MagnifyingGlassIcon size={18} color={colors.textSecondary} weight="bold" />}
      />

      <ChipGroup
        options={CATEGORY_OPTIONS}
        value={kategori}
        onChange={(k) => setKategori(kategori === k ? null : k)}
        labels={CATEGORY_LABEL}
      />

      {library.isPending ? (
        <Loading />
      ) : daftar.length === 0 ? (
        <EmptyState title="Tidak ada yang cocok" message="Coba kata kunci lain." />
      ) : (
        daftar.map((item) => (
          <Pressable
            key={item.sumber + item.id}
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.pickItem, pressed && styles.pressed]}
          >
            <View style={styles.pickText}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="caption" tone="tertiary">
                {item.perMenit.toFixed(1)} kkal/menit
                {item.sumber === 'custom' ? ' · custom' : ''}
              </Text>
            </View>
            <CaretRightIcon size={16} color={colors.textTertiary} weight="bold" />
          </Pressable>
        ))
      )}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pickerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.75 },
  durationCard: { gap: spacing.lg },
  group: { gap: spacing.md },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logText: { flex: 1, gap: 2 },
  pickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  pickText: { flex: 1, gap: 2 },
});
