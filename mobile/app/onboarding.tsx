import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ChipGroup,
  DateField,
  ErrorNote,
  Header,
  Input,
  Loading,
  Screen,
  Text,
} from '@/components/ui';
import { colors } from '@/constants/colors';
import {
  ACTIVITY_HINT,
  ACTIVITY_LABEL,
  ACTIVITY_OPTIONS,
  GENDER_LABEL,
  GENDER_OPTIONS,
} from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useProfile, useSaveProfile } from '@/services/users.service';
import type { ActivityLevel, Gender } from '@/types';

/**
 * Batas usia yang diterima backend: 10 sampai 120 tahun. Ditegakkan juga di
 * kalender supaya tanggal yang mustahil tidak bisa dipilih sejak awal, lebih
 * baik daripada menolaknya setelah user menekan simpan.
 */
const geserTahun = (tahun: number): Date => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - tahun);
  return d;
};

const LAHIR_PALING_BARU = geserTahun(10);
const LAHIR_PALING_LAMA = geserTahun(120);
const LAHIR_BAWAAN = geserTahun(25);

/**
 * Pengisian dan penyuntingan profil.
 *
 * Layar yang sama dipakai untuk keduanya. Kalau profil sudah ada, isinya
 * dimuat lebih dulu dan permintaannya menjadi PATCH, memisahkannya jadi dua
 * layar hanya akan menduplikasi form yang persis sama.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const profile = useProfile();

  const sudahAda = profile.data !== null && profile.data !== undefined;
  const simpanProfil = useSaveProfile(sudahAda ? 'update' : 'create');

  const [tinggi, setTinggi] = useState('');
  const [lahir, setLahir] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [aktivitas, setAktivitas] = useState<ActivityLevel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terisi, setTerisi] = useState(false);

  // Nilai awal diisi sekali saja setelah data datang. Menaruhnya di useEffect
  // yang bergantung pada profile.data akan menimpa ketikan user setiap kali
  // query di-refetch di latar belakang.
  if (!terisi && profile.data) {
    setTinggi(String(Math.round(Number(profile.data.height_cm))));
    setLahir(profile.data.birth_date);
    setGender(profile.data.gender);
    setAktivitas(profile.data.activity_level);
    setTerisi(true);
  }

  const simpan = () => {
    const tinggiAngka = Number(tinggi.replace(',', '.'));

    if (!Number.isFinite(tinggiAngka) || tinggiAngka < 50 || tinggiAngka > 260) {
      setError('Tinggi badan harus antara 50 sampai 260 cm');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(lahir)) {
      setError('Tanggal lahir harus berformat YYYY-MM-DD');
      return;
    }

    if (!gender || !aktivitas) {
      setError('Pilih jenis kelamin dan level aktivitas');
      return;
    }

    setError(null);

    simpanProfil.mutate(
      {
        height_cm: tinggiAngka,
        birth_date: lahir,
        gender,
        activity_level: aktivitas,
      },
      {
        onSuccess: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)')),
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  if (profile.isPending) {
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <Header title={sudahAda ? 'Ubah profil' : 'Lengkapi profil'} />

        <Text variant="body" tone="secondary">
          Angka-angka ini dipakai menghitung kebutuhan kalori harian kamu dengan rumus Mifflin-St
          Jeor.
        </Text>

        <Input
          label="Tinggi badan"
          value={tinggi}
          onChangeText={setTinggi}
          placeholder="170"
          keyboardType="number-pad"
          suffix="cm"
        />

        <DateField
          label="Tanggal lahir"
          value={lahir}
          onChange={setLahir}
          hint="Dipakai menghitung usia untuk rumus BMR"
          minimumDate={LAHIR_PALING_LAMA}
          maximumDate={LAHIR_PALING_BARU}
          defaultDate={LAHIR_BAWAAN}
        />

        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Jenis kelamin
          </Text>
          <ChipGroup
            options={GENDER_OPTIONS}
            value={gender}
            onChange={setGender}
            labels={GENDER_LABEL}
            wrap
          />
        </View>

        <View style={styles.group}>
          <Text variant="label" tone="secondary">
            Pekerjaan sehari-hari
          </Text>

          {/*
            Pertanyaannya sengaja soal pekerjaan, bukan seberapa sering olahraga.
            Olahraga, langkah, dan tidur sudah dihitung terpisah dari data yang
            kamu catat, kalau ditanyakan lagi di sini, jam yang sama dihitung
            dua kali dan targetmu jadi terlalu longgar.
          */}
          <Text variant="caption" tone="tertiary" style={styles.levelHint}>
            Olahraga tidak perlu dihitung di sini, karena sudah diambil dari catatan olahraga,
            langkah, dan tidurmu.
          </Text>

          {ACTIVITY_OPTIONS.map((level) => {
            const aktif = aktivitas === level;

            return (
              <Pressable
                key={level}
                onPress={() => setAktivitas(level)}
                style={({ pressed }) => [
                  styles.level,
                  aktif && styles.levelActive,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.levelText}>
                  <Text variant="label" tone={aktif ? 'accent' : 'primary'}>
                    {ACTIVITY_LABEL[level]}
                  </Text>
                  <Text variant="caption" tone="secondary">
                    {ACTIVITY_HINT[level]}
                  </Text>
                </View>

                <View style={[styles.radio, aktif && styles.radioActive]} />
              </Pressable>
            );
          })}
        </View>

        {error ? <ErrorNote message={error} /> : null}

        <Card variant="outline" padding="md">
          <Text variant="caption" tone="tertiary">
            Kebutuhan kalori baru bisa dihitung setelah kamu mencatat berat badan minimal satu kali.
          </Text>
        </Card>

        <Button
          label={sudahAda ? 'Simpan perubahan' : 'Simpan profil'}
          onPress={simpan}
          loading={simpanProfil.isPending}
          size="lg"
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  group: { gap: spacing.md },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  levelActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  levelText: { flex: 1, gap: 2 },
  levelHint: { marginBottom: spacing.xs },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioActive: { borderColor: colors.primary, borderWidth: 6 },
  pressed: { opacity: 0.8 },
});
