import { useRouter } from 'expo-router';
import {
  BarbellIcon,
  CameraIcon,
  CaretRightIcon,
  DropIcon,
  PencilSimpleIcon,
  ScalesIcon,
  SignOutIcon,
  TargetIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  DateField,
  Divider,
  ErrorNote,
  IconCircle,
  Input,
  Loading,
  Row,
  Screen,
  SectionHeader,
  Sheet,
  Text,
} from '@/components/ui';
import { colors } from '@/constants/colors';
import { ACTIVITY_LABEL, GENDER_LABEL } from '@/constants/labels';
import { radius, spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import {
  useActiveGoal,
  useCreateGoal,
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/services/misc.service';
import { ReminderRow } from '@/components/features/ReminderRow';
import { ReminderSheet, type ReminderKind } from '@/components/features/ReminderSheet';
import { useReminderScheduler } from '@/hooks/useReminderScheduler';
import { pengingatDidukung } from '@/lib/reminders';
import { useProfile } from '@/services/users.service';
import { useAuthStore } from '@/stores/auth.store';
import { longDate, shiftDays, todayWIB } from '@/utils/date';
import { initials, kg, thousands } from '@/utils/format';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const profile = useProfile();
  const goal = useActiveGoal();
  const settings = useNotificationSettings();
  const updateSettings = useUpdateNotificationSettings();

  const [sheetGoal, setSheetGoal] = useState(false);
  const [sheetReminder, setSheetReminder] = useState<ReminderKind | null>(null);

  // Jadwal di perangkat disusun ulang setiap pengaturan berubah.
  useReminderScheduler(settings.data);

  const keluar = () => {
    Alert.alert('Keluar dari akun?', 'Kamu perlu masuk lagi untuk melihat catatanmu.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const ubahReminder = (kunci: string, nilai: boolean) => {
    updateSettings.mutate({ [kunci]: nilai });
  };

  const p = profile.data;

  return (
    <Screen bottomInset refreshing={profile.isRefetching} onRefresh={() => void profile.refetch()}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text variant="h2" tone="inverse">
            {initials(user?.name ?? 'G')}
          </Text>
        </View>

        <View style={styles.headText}>
          <Text variant="h2" numberOfLines={1}>
            {user?.name ?? '—'}
          </Text>
          <Text variant="caption" tone="secondary" numberOfLines={1}>
            {user?.email ?? ''}
          </Text>
        </View>

        <IconCircle size={44} onPress={() => router.push('/onboarding')}>
          <PencilSimpleIcon size={18} color={colors.textPrimary} weight="bold" />
        </IconCircle>
      </View>

      {profile.isPending ? (
        <Loading />
      ) : !p ? (
        <Card variant="outline" onPress={() => router.push('/onboarding')}>
          <View style={styles.notice}>
            <Text variant="label">Profil belum diisi</Text>
            <Text variant="caption" tone="secondary">
              Tanpa tinggi badan dan usia, kebutuhan kalori harian tidak bisa dihitung.
            </Text>
          </View>
        </Card>
      ) : (
        <Card>
          <View style={styles.stats}>
            <View style={styles.statRow}>
              <Stat label="Usia" value={p.age + ' th'} />
              <Stat label="Tinggi" value={kg(p.height_cm, 0) + ' cm'} />
              <Stat label="Berat" value={p.current_weight_kg ? kg(p.current_weight_kg) : '—'} />
            </View>

            <Divider />

            <Row label="Jenis kelamin" value={GENDER_LABEL[p.gender]} />
            <Row label="Level aktivitas" value={ACTIVITY_LABEL[p.activity_level]} />
            <Row
              label="BMR"
              value={p.bmr === null ? 'Butuh data berat' : thousands(p.bmr) + ' kkal'}
            />
            <Row
              label="TDEE"
              value={p.tdee === null ? 'Butuh data berat' : thousands(p.tdee) + ' kkal'}
              tone="accent"
            />
          </View>
        </Card>
      )}

      <SectionHeader
        title="Target"
        action={
          <IconCircle size={36} onPress={() => setSheetGoal(true)}>
            <PencilSimpleIcon size={16} color={colors.textSecondary} weight="bold" />
          </IconCircle>
        }
      />

      <Card onPress={() => setSheetGoal(true)}>
        {goal.data ? (
          <View style={styles.goalCard}>
            <View style={[styles.goalIcon, { backgroundColor: colors.primarySoft }]}>
              <TargetIcon size={24} color={colors.primary} weight="duotone" />
            </View>

            <View style={styles.goalText}>
              <Text variant="label">{kg(goal.data.target_weight_kg) + ' kg'}</Text>
              <Text variant="caption" tone="secondary">
                Target {longDate(goal.data.target_date)}
              </Text>
              <Text variant="caption" tone="accent">
                Jatah {thousands(goal.data.daily_calorie_budget)} kkal per hari
              </Text>
            </View>

            <CaretRightIcon size={18} color={colors.textSecondary} weight="bold" />
          </View>
        ) : (
          <View style={styles.notice}>
            <Text variant="label">Belum ada target</Text>
            <Text variant="caption" tone="secondary">
              Tetapkan target berat supaya jatah kalori harian bisa dihitung.
            </Text>
          </View>
        )}
      </Card>

      <SectionHeader title="Pengingat" />

      <Card padding="md">
        {settings.data ? (
          <View>
            <ReminderRow
              icon={<ScalesIcon size={18} color={colors.textSecondary} weight="duotone" />}
              label="Timbang berat"
              value={settings.data.weight_reminder_time}
              enabled={settings.data.weight_reminder_enabled}
              onToggle={(v) => ubahReminder('weight_reminder_enabled', v)}
              onPressValue={() => setSheetReminder('weight')}
            />
            <ReminderRow
              icon={<DropIcon size={18} color={colors.textSecondary} weight="duotone" />}
              label="Minum air"
              value={'Tiap ' + settings.data.water_reminder_interval_hours + ' jam'}
              enabled={settings.data.water_reminder_enabled}
              onToggle={(v) => ubahReminder('water_reminder_enabled', v)}
              onPressValue={() => setSheetReminder('water')}
            />
            <ReminderRow
              icon={<BarbellIcon size={18} color={colors.textSecondary} weight="duotone" />}
              label="Olahraga"
              value={settings.data.workout_reminder_time}
              enabled={settings.data.workout_reminder_enabled}
              onToggle={(v) => ubahReminder('workout_reminder_enabled', v)}
              onPressValue={() => setSheetReminder('workout')}
            />
            <ReminderRow
              icon={<CameraIcon size={18} color={colors.textSecondary} weight="duotone" />}
              label="Foto badan"
              value={settings.data.photo_reminder_time}
              enabled={settings.data.photo_reminder_enabled}
              onToggle={(v) => ubahReminder('photo_reminder_enabled', v)}
              onPressValue={() => setSheetReminder('photo')}
              last
            />
          </View>
        ) : (
          <Loading />
        )}
      </Card>

      {/* Expo Go tidak bisa menjadwalkan notifikasi sejak SDK 53, jadi
          pengaturan di atas tersimpan tapi tidak akan pernah berbunyi di sana.
          Lebih baik dikatakan terus terang daripada dibiarkan user menunggu
          notifikasi yang tidak mungkin datang. */}
      {!pengingatDidukung() ? (
        <Card variant="outline" padding="md">
          <Text variant="caption" tone="secondary">
            Pengaturan tersimpan, tapi notifikasinya belum bisa berbunyi di Expo Go. Perlu dev build
            supaya pengingat benar-benar muncul.
          </Text>
        </Card>
      ) : null}

      <Button
        label="Keluar"
        onPress={keluar}
        variant="secondary"
        icon={<SignOutIcon size={18} color={colors.textPrimary} weight="bold" />}
      />

      <GoalSheet visible={sheetGoal} onClose={() => setSheetGoal(false)} />

      {sheetReminder && settings.data ? (
        <ReminderSheet
          key={sheetReminder}
          kind={sheetReminder}
          settings={settings.data}
          onClose={() => setSheetReminder(null)}
        />
      ) : null}
    </Screen>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.stat}>
    <Text variant="h3">{value}</Text>
    <Text variant="caption" tone="tertiary">
      {label}
    </Text>
  </View>
);

/**
 * Membuat target baru selalu menonaktifkan target lama di backend, jadi form
 * ini sengaja tidak menawarkan mode "ubah" — yang terjadi adalah menetapkan
 * target baru, dan target lama tetap tersimpan sebagai riwayat.
 */
const GoalSheet = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const createGoal = useCreateGoal();

  const [berat, setBerat] = useState('');
  const [tanggal, setTanggal] = useState(shiftDays(todayWIB(), 90));
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    const beratAngka = Number(berat.replace(',', '.'));

    if (!Number.isFinite(beratAngka) || beratAngka < 20 || beratAngka > 400) {
      setError('Target berat harus antara 20 sampai 400 kg');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      setError('Tanggal harus berformat YYYY-MM-DD');
      return;
    }

    setError(null);

    const budgetAngka = budget.trim() === '' ? undefined : Number(budget);

    createGoal.mutate(
      {
        target_weight_kg: beratAngka,
        target_date: tanggal,
        daily_calorie_budget: Number.isFinite(budgetAngka) ? budgetAngka : undefined,
      },
      {
        onSuccess: () => {
          setBerat('');
          setBudget('');
          onClose();
        },
        onError: (e) => setError(toApiError(e).message),
      },
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Tetapkan target"
      footer={
        <Button label="Simpan target" onPress={simpan} loading={createGoal.isPending} size="lg" />
      }
    >
      <Input
        label="Target berat"
        value={berat}
        onChangeText={setBerat}
        placeholder="70"
        keyboardType="decimal-pad"
        suffix="kg"
      />

      <DateField
        label="Target tanggal"
        value={tanggal}
        onChange={setTanggal}
        hint="Kapan kamu ingin mencapai berat itu"
        minimumDate={new Date()}
      />

      <Input
        label="Jatah kalori harian"
        value={budget}
        onChangeText={setBudget}
        placeholder="Kosongkan agar dihitung otomatis"
        keyboardType="number-pad"
        suffix="kkal"
        hint="Dihitung dari TDEE dan selisih berat kalau dikosongkan"
      />

      {error ? <ErrorNote message={error} /> : null}
    </Sheet>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  headText: { flex: 1, gap: 2 },
  notice: { gap: spacing.xs },
  stats: { gap: spacing.md },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  goalCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalText: { flex: 1, gap: 2 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  toggleBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleText: { flex: 1, gap: 2 },
});
