import * as Haptics from 'expo-haptics';
import { LogActions } from '@/components/features/LogActions';
import { WaterEditSheet } from '@/components/features/WaterEditSheet';
import { DropIcon, PlusIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Card,
  DateStrip,
  EmptyState,
  ErrorNote,
  Header,
  Loading,
  Ring,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { radius, spacing, typography } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useDailySummary } from '@/services/misc.service';
import { useAddWater, useDeleteWater, useWaterDate } from '@/services/water.service';
import type { WaterLog } from '@/types';
import { dayPhrase, timeWIB, todayWIB, wibToISO } from '@/utils/date';
import { ratio, volume } from '@/utils/format';

/** Takaran yang paling sering dipakai, supaya mencatat cukup satu ketukan. */
const TAKARAN = [150, 250, 500, 750];

export default function WaterScreen() {
  /**
   * Tanggal yang sedang dilihat. Bawaannya hari ini, tapi user bisa mundur
   * untuk membaca dan melengkapi catatan hari-hari sebelumnya.
   */
  const [tanggal, setTanggal] = useState(todayWIB());
  const hariIni = tanggal === todayWIB();

  const today = useWaterDate(tanggal);
  const addWater = useAddWater();
  const deleteWater = useDeleteWater();

  const [error, setError] = useState<string | null>(null);
  const [diedit, setDiedit] = useState<WaterLog | null>(null);

  const total = today.data?.total_ml ?? 0;

  /**
   * Target minum diturunkan backend dari berat badan dan usia, 35 ml per kg
   * untuk dewasa, lebih rendah untuk usia lanjut, plus tambahan sesuai lama
   * olahraga hari itu.
   *
   * Angka tetap 2500ml yang dulu ada di sini memaksa orang bertubuh kecil minum
   * berlebihan, sementara yang bertubuh besar merasa sudah cukup padahal belum.
   */
  const targetMl = useDailySummary(tanggal).data?.targets.water_ml ?? 0;

  const tambah = (ml: number) => {
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    addWater.mutate(
      {
        amount_ml: ml,
        // Saat menelusuri hari lampau, tegukan dicatat ke tanggal ITU, bukan ke
        // hari ini. Tengah hari dipakai sebagai jam netral karena jam
        // sesungguhnya sudah tidak bisa diingat lagi.
        logged_at: hariIni ? undefined : wibToISO(tanggal, '12:00'),
      },
      { onError: (e) => setError(toApiError(e).message) },
    );
  };

  const hapus = (id: string) => {
    setError(null);
    deleteWater.mutate(id, { onError: (e) => setError(toApiError(e).message) });
  };

  return (
    <>
      <Screen refreshing={today.isRefetching} onRefresh={() => void today.refetch()}>
        <Header title="Minum air" subtitle="Boleh dicatat berkali-kali sehari" />

        <DateStrip value={tanggal} onChange={setTanggal} />

        {today.isPending ? (
          <Loading />
        ) : (
          <>
            <Card>
              <View style={styles.ringCard}>
                <Ring
                  progress={ratio(total, targetMl)}
                  size={190}
                  thickness={14}
                  color={metricColors.water}
                  sweep={0.78}
                >
                  <View style={styles.ringCenter}>
                    <DropIcon size={22} color={metricColors.water} weight="duotone" />
                    <Text style={typography.metric}>{volume(total)}</Text>
                    <Text variant="caption" tone="secondary">
                      dari {volume(targetMl)}
                    </Text>
                  </View>
                </Ring>
              </View>
            </Card>

            <SectionHeader title="Tambah cepat" />

            <View style={styles.quick}>
              {TAKARAN.map((ml) => (
                <Pressable
                  key={ml}
                  onPress={() => tambah(ml)}
                  disabled={addWater.isPending}
                  style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
                >
                  <PlusIcon size={16} color={metricColors.water} weight="bold" />
                  <Text variant="label">{ml}</Text>
                  <Text variant="caption" tone="tertiary">
                    ml
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <ErrorNote message={error} /> : null}

            <SectionHeader title={'Catatan ' + dayPhrase(tanggal)} />

            {(today.data?.logs.length ?? 0) === 0 ? (
              <EmptyState
                icon={<DropIcon size={30} color={colors.textTertiary} weight="duotone" />}
                title="Belum ada catatan minum"
                message="Ketuk salah satu takaran di atas untuk mencatat."
              />
            ) : (
              <Card padding="md">
                <View>
                  {today.data?.logs.map((log, index) => (
                    <View
                      key={log.id}
                      style={[
                        styles.row,
                        index < (today.data?.logs.length ?? 0) - 1 && styles.rowBorder,
                      ]}
                    >
                      <View style={styles.rowIcon}>
                        <DropIcon size={16} color={metricColors.water} weight="fill" />
                      </View>

                      <View style={styles.rowText}>
                        <Text variant="bodyMedium">{log.amount_ml} ml</Text>
                        <Text variant="caption" tone="tertiary">
                          {timeWIB(log.logged_at)} WIB
                        </Text>
                      </View>

                      <LogActions
                        row
                        onEdit={() => setDiedit(log)}
                        onDelete={() => hapus(log.id)}
                        deleteMessage={'Tegukan ' + log.amount_ml + ' ml akan dihapus.'}
                      />
                    </View>
                  ))}
                </View>
              </Card>
            )}
          </>
        )}
      </Screen>

      {diedit ? (
        <WaterEditSheet key={diedit.id} log={diedit} onClose={() => setDiedit(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  ringCard: { alignItems: 'center' },
  ringCenter: { alignItems: 'center', gap: 2 },
  quick: { flexDirection: 'row', gap: spacing.md },
  quickItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSoft,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
  rowText: { flex: 1, gap: 2 },
});
