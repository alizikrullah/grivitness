import { useRouter } from 'expo-router';
import {
  BarbellIcon,
  BellIcon,
  CaretRightIcon,
  FireIcon,
  PencilSimpleIcon,
  SignOutIcon,
  TargetIcon,
} from 'phosphor-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import {
  Button,
  Card,
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
        <View>
          <Toggle
            icon={<BellIcon size={18} color={colors.textSecondary} weight="duotone" />}
            label="Timbang berat badan"
            hint={settings.data?.weight_reminder_time}
            value={settings.data?.weight_reminder_enabled ?? false}
            onChange={(v) => ubahReminder('weight_reminder_enabled', v)}
          />
          <Toggle
            icon={<FireIcon size={18} color={colors.textSecondary} weight="duotone" />}
            label="Minum air"
            hint={
              settings.data
                ? 'Tiap ' + settings.data.water_reminder_interval_hours + ' jam'
                : undefined
            }
            value={settings.data?.water_reminder_enabled ?? false}
            onChange={(v) => ubahReminder('water_reminder_enabled', v)}
          />
          <Toggle
            icon={<BarbellIcon size={18} color={colors.textSecondary} weight="duotone" />}
            label="Olahraga"
            hint={settings.data?.workout_reminder_time}
            value={settings.data?.workout_reminder_enabled ?? false}
            onChange={(v) => ubahReminder('workout_reminder_enabled', v)}
          />
          <Toggle
            icon={<BellIcon size={18} color={colors.textSecondary} weight="duotone" />}
            label="Foto badan"
            hint={settings.data?.photo_reminder_time}
            value={settings.data?.photo_reminder_enabled ?? false}
            onChange={(v) => ubahReminder('photo_reminder_enabled', v)}
            last
          />
        </View>
      </Card>

      <Button
        label="Keluar"
        onPress={keluar}
        variant="secondary"
        icon={<SignOutIcon size={18} color={colors.textPrimary} weight="bold" />}
      />

      <GoalSheet visible={sheetGoal} onClose={() => setSheetGoal(false)} />
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

const Toggle = ({
  icon,
  label,
  hint,
  value,
  onChange,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) => (
  <View style={[styles.toggle, !last && styles.toggleBorder]}>
    {icon}
    <View style={styles.toggleText}>
      <Text variant="bodyMedium">{label}</Text>
      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: colors.surfaceHigh, true: colors.primary }}
      thumbColor={colors.white}
      ios_backgroundColor={colors.surfaceHigh}
    />
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

      <Input
        label="Target tanggal"
        value={tanggal}
        onChangeText={setTanggal}
        placeholder="YYYY-MM-DD"
        hint="Contoh: 2026-12-31"
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
