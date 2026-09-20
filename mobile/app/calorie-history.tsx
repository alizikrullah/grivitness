import { WatchIcon } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BalanceChart,
  Card,
  ChipGroup,
  EmptyState,
  ErrorNote,
  Header,
  Loading,
  Screen,
  SectionHeader,
  Text,
} from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { spacing } from '@/constants/theme';
import { toApiError } from '@/lib/api';
import { useCalorieHistory } from '@/services/misc.service';
import type { HistoryDay } from '@/types';
import { dayLabel, shortDate } from '@/utils/date';
import { thousands } from '@/utils/format';

const RENTANG = ['7', '14', '30'] as const;
const RENTANG_LABEL = { '7': '7 hari', '14': '14 hari', '30': '30 hari' };

/** "+420" untuk defisit, "-180" untuk surplus. Tanda selalu ditulis supaya arahnya tidak terbaca ganda. */
const tandaKkal = (n: number): string => (n >= 0 ? '+' : '-') + thousands(Math.abs(n));

/**
 * Riwayat kalori masuk vs keluar, halaman kontrol defisit.
 *
 * Beranda sengaja tetap "hari ini". Pertanyaan yang dijawab halaman ini
 * berbeda: bukan "hari ini sisa berapa", tapi "seminggu ini gua konsisten atau
 * tidak". Karena itu yang ditonjolkan defisit per hari dan rata-ratanya, bukan
 * sisa jatah.
 *
 * Yang sengaja TIDAK ada: konversi defisit ke "setara sekian kg lemak".
 * Kaidah 7700 dibagi linear itu persis yang dibuang dari rencana berat badan,
 * dan angka itu bakal meleset dari timbangan lalu bikin bingung. Timbangan
 * yang jadi juri; halaman ini yang menjelaskan kenapa.
 */
export default function CalorieHistoryScreen() {
  const [rentang, setRentang] = useState<(typeof RENTANG)[number]>('14');
  const hari = Number(rentang);

  const riwayat = useCalorieHistory(hari);
  const d = riwayat.data;

  const dataChart = (d?.days ?? []).map((h) => ({
    label: hari <= 14 ? dayLabel(h.date) : (shortDate(h.date).split(' ')[0] ?? ''),
    value: h.logged ? h.balance : null,
    caption: h.logged
      ? `${shortDate(h.date)}: ${tandaKkal(h.balance)} kkal (masuk ${thousands(h.calories_in)}, keluar ${thousands(h.calories_out)})`
      : undefined,
  }));

  const s = d?.summary;

  return (
    <Screen refreshing={riwayat.isRefetching} onRefresh={() => void riwayat.refetch()}>
      <Header title="Riwayat kalori" subtitle="Masuk lawan keluar, per hari" />

      <ChipGroup options={RENTANG} value={rentang} onChange={setRentang} labels={RENTANG_LABEL} />

      {riwayat.isPending ? (
        <Loading />
      ) : riwayat.isError ? (
        <ErrorNote message={toApiError(riwayat.error).message} />
      ) : !d || s === undefined || s.days_logged === 0 ? (
        <EmptyState
          title="Belum ada yang bisa dibandingkan"
          message="Catat makanan minimal satu hari, dan riwayatnya muncul di sini."
        />
      ) : (
        <>
          {/*
            Rata-rata dari hari yang TERCATAT saja. Hari yang tidak dicatat
            bukan hari tanpa makan; memasukkannya membuat defisit tampak jauh
            lebih besar dari kenyataan, persis arah kesalahan paling berbahaya.
          */}
          <Card>
            <View style={styles.ringkas}>
              <View style={styles.ringkasBaris}>
                <Ringkas
                  label="Rata-rata masuk"
                  nilai={thousands(s.avg_calories_in)}
                  satuan="kkal"
                />
                <Ringkas
                  label="Rata-rata keluar"
                  nilai={thousands(s.avg_calories_out)}
                  satuan="kkal"
                />
              </View>
              <View style={styles.ringkasBaris}>
                <Ringkas
                  label="Rata-rata defisit"
                  nilai={tandaKkal(s.avg_balance)}
                  satuan="kkal/hari"
                  tone={s.avg_balance >= 0 ? 'success' : 'warning'}
                />
                <Ringkas
                  label="Hari defisit"
                  nilai={`${s.deficit_days} dari ${s.days_logged}`}
                  satuan="hari tercatat"
                />
              </View>
              <Text variant="caption" tone="tertiary">
                Rata-rata cuma dari hari yang makanannya tercatat. Hari kosong tidak dianggap
                defisit, cuma tidak dicatat.
              </Text>
            </View>
          </Card>

          <Card>
            <View style={styles.chartCard}>
              <Text variant="label">Defisit per hari</Text>
              <Text variant="caption" tone="tertiary">
                Hijau ke atas berarti keluar lebih besar dari masuk. Merah ke bawah berarti lewat.
              </Text>
              <BalanceChart data={dataChart} formatValue={(v) => tandaKkal(v) + ' kkal'} />
            </View>
          </Card>

          <SectionHeader title="Per hari" />

          {[...d.days].reverse().map((h) => (
            <BarisHari key={h.date} hari={h} />
          ))}
        </>
      )}
    </Screen>
  );
}

const Ringkas = ({
  label,
  nilai,
  satuan,
  tone = 'primary',
}: {
  label: string;
  nilai: string;
  satuan: string;
  tone?: 'primary' | 'success' | 'warning';
}) => (
  <View style={styles.ringkasItem}>
    <Text variant="caption" tone="tertiary">
      {label}
    </Text>
    <Text variant="h3" tone={tone}>
      {nilai}
    </Text>
    <Text variant="caption" tone="tertiary">
      {satuan}
    </Text>
  </View>
);

const BarisHari = ({ hari }: { hari: HistoryDay }) => {
  if (!hari.logged) {
    return (
      <Card padding="md">
        <View style={styles.baris}>
          <Text variant="label" tone="tertiary" style={styles.barisTanggal}>
            {shortDate(hari.date)}
          </Text>
          <Text variant="caption" tone="tertiary">
            Tidak ada catatan makan
          </Text>
        </View>
      </Card>
    );
  }

  const defisit = hari.balance >= 0;

  return (
    <Card padding="md">
      <View style={styles.barisKartu}>
        <View style={styles.baris}>
          <Text variant="label" style={styles.barisTanggal}>
            {shortDate(hari.date)}
          </Text>
          <Text variant="label" tone={defisit ? 'success' : 'warning'}>
            {tandaKkal(hari.balance)} kkal
          </Text>
        </View>

        <View style={styles.baris}>
          <Text variant="caption" tone="secondary">
            Masuk {thousands(hari.calories_in)}
          </Text>
          <View style={styles.keluar}>
            {hari.calories_out_source === 'device' ? (
              <WatchIcon size={12} color={metricColors.device} weight="fill" />
            ) : null}
            <Text variant="caption" tone="secondary">
              Keluar {thousands(hari.calories_out)}
            </Text>
          </View>
          {hari.calorie_budget !== null ? (
            <Text variant="caption" tone="tertiary">
              Jatah {thousands(hari.calorie_budget)}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  ringkas: { gap: spacing.md },
  ringkasBaris: { flexDirection: 'row', gap: spacing.md },
  ringkasItem: { flex: 1, gap: 2 },
  chartCard: { gap: spacing.sm },
  barisKartu: { gap: spacing.xs },
  baris: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  barisTanggal: { flex: 1 },
  keluar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
