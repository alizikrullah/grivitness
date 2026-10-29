import { type RefObject, useRef, useState } from 'react';
import { Pressable, StyleSheet, type TextInput, View } from 'react-native';

import { Input, Text } from '@/components/ui';
import { spacing } from '@/constants/theme';
import type { RincianSesiInput, WorkoutEditInput } from '@/services/workouts.service';
import type { DistanceKind, WorkoutLog, WorkoutScanResult } from '@/types';
import { pace } from '@/utils/format';

/**
 * Isian sesi lari dan jalan: jarak, durasi, pace, HR, plus detail lain dari
 * jam. Biasanya terisi dari screenshot, tapi semuanya bisa diketik.
 *
 * Durasi dan pace dipecah jadi menit dan detik, bukan satu kolom "44:45":
 * papan angka Android tidak punya titik dua.
 */
export interface RincianLari {
  jarak: string;
  durasiMenit: string;
  durasiDetik: string;
  paceMenit: string;
  paceDetik: string;
  hr: string;
  hrMaks: string;
  kadens: string;
  langkah: string;
  elevasi: string;
  te: string;
  /** Jam mulai dari screenshot, ISO. Tidak diketik. */
  mulai: string | null;
}

export const RINCIAN_KOSONG: RincianLari = {
  jarak: '',
  durasiMenit: '',
  durasiDetik: '',
  paceMenit: '',
  paceDetik: '',
  hr: '',
  hrMaks: '',
  kadens: '',
  langkah: '',
  elevasi: '',
  te: '',
  mulai: null,
};

/** Angka positif dari isian, koma diterima sebagai desimal. */
export const angkaRincian = (teks: string): number | null => {
  const n = Number(teks.replace(',', '.'));
  return teks.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

const bulat = (teks: string): number | null => {
  const n = angkaRincian(teks);
  return n === null ? null : Math.round(n);
};

const menitDetik = (menit: string, detik: string): number | null => {
  const total = (bulat(menit) ?? 0) * 60 + (bulat(detik) ?? 0);
  return total > 0 ? total : null;
};

export const detikDurasi = (r: RincianLari): number | null =>
  menitDetik(r.durasiMenit, r.durasiDetik);

/** Pace yang diketik, atau null kalau dibiarkan kosong. */
export const detikPaceDiketik = (r: RincianLari): number | null =>
  menitDetik(r.paceMenit, r.paceDetik);

/** Pace dari durasi dan jarak, sama seperti backend kalau pacenya kosong. */
export const paceOtomatis = (r: RincianLari): number | null => {
  const jarak = angkaRincian(r.jarak);
  const detik = detikDurasi(r);
  return jarak !== null && detik !== null ? Math.round(detik / jarak) : null;
};

const pisah = (detik: number | null): [string, string] =>
  detik === null ? ['', ''] : [String(Math.floor(detik / 60)), String(detik % 60)];

const teksAngka = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : String(n).replace('.', ',');

export const rincianDariScan = (scan: WorkoutScanResult): RincianLari => {
  const [durasiMenit, durasiDetik] = pisah(scan.duration_seconds);
  const [paceMenit, paceDetik] = pisah(scan.pace_seconds_per_km);
  return {
    jarak: teksAngka(scan.distance_km),
    durasiMenit,
    durasiDetik,
    paceMenit,
    paceDetik,
    hr: teksAngka(scan.avg_hr),
    hrMaks: teksAngka(scan.max_hr),
    kadens: teksAngka(scan.avg_cadence),
    langkah: teksAngka(scan.step_count),
    elevasi: teksAngka(scan.elevation_gain_m),
    te: teksAngka(scan.training_effect),
    mulai: scan.started_at,
  };
};

export const rincianDariLog = (log: WorkoutLog): RincianLari => {
  const [durasiMenit, durasiDetik] = pisah(log.duration_seconds ?? log.duration_minutes * 60);
  const [paceMenit, paceDetik] = pisah(log.pace_seconds_per_km);
  return {
    jarak: teksAngka(log.distance_km === null ? null : Number(log.distance_km)),
    durasiMenit,
    durasiDetik,
    paceMenit,
    paceDetik,
    hr: teksAngka(log.avg_hr),
    hrMaks: teksAngka(log.max_hr),
    kadens: teksAngka(log.avg_cadence),
    langkah: teksAngka(log.step_count),
    elevasi: teksAngka(log.elevation_gain_m),
    te: teksAngka(log.training_effect === null ? null : Number(log.training_effect)),
    mulai: log.started_at,
  };
};

/**
 * Bagian body permintaan. Untuk lari dan jalan durasinya dikirim dalam detik
 * (backend menurunkan menitnya); untuk olahraga lain cuma HR dan detail jam.
 */
export const rincianKeBody = (r: RincianLari, berjarak: boolean): RincianSesiInput => {
  const isi: RincianSesiInput = {};
  const set = <K extends keyof RincianSesiInput>(kunci: K, nilai: RincianSesiInput[K] | null) => {
    if (nilai !== null && nilai !== undefined) isi[kunci] = nilai;
  };

  set('avg_hr', bulat(r.hr));
  set('max_hr', bulat(r.hrMaks));
  set('training_effect', angkaRincian(r.te));
  set('started_at', r.mulai);

  if (berjarak) {
    set('duration_seconds', detikDurasi(r));
    const jarak = angkaRincian(r.jarak);
    set('distance_km', jarak === null ? null : Math.round(jarak * 100) / 100);
    set('pace_seconds_per_km', detikPaceDiketik(r));
    set('avg_cadence', bulat(r.kadens));
    set('step_count', bulat(r.langkah));
    set('elevation_gain_m', bulat(r.elevasi));
  }

  return isi;
};

type KoreksiRincian = Pick<
  WorkoutEditInput,
  | 'duration_seconds'
  | 'distance_km'
  | 'pace_seconds_per_km'
  | 'avg_hr'
  | 'max_hr'
  | 'avg_cadence'
  | 'step_count'
>;

/**
 * Yang berubah saja, untuk PATCH. Angka yang dikosongkan dikirim null supaya
 * terhapus. Pace yang dikosongkan tidak dikirim: backend menghitungnya ulang
 * dari jarak dan durasi kalau salah satunya berubah.
 */
export const rincianBerubah = (
  awal: RincianLari,
  kini: RincianLari,
  berjarak: boolean,
): KoreksiRincian => {
  const hasil: KoreksiRincian = {};
  const jarak = (r: RincianLari) => {
    const n = angkaRincian(r.jarak);
    return n === null ? null : Math.round(n * 100) / 100;
  };

  if (bulat(awal.hr) !== bulat(kini.hr)) hasil.avg_hr = bulat(kini.hr);
  if (bulat(awal.hrMaks) !== bulat(kini.hrMaks)) hasil.max_hr = bulat(kini.hrMaks);

  if (berjarak) {
    const durasi = detikDurasi(kini);
    if (durasi !== null && durasi !== detikDurasi(awal)) hasil.duration_seconds = durasi;
    if (jarak(awal) !== jarak(kini)) hasil.distance_km = jarak(kini);
    const paceKini = detikPaceDiketik(kini);
    if (paceKini !== null && paceKini !== detikPaceDiketik(awal)) {
      hasil.pace_seconds_per_km = paceKini;
    }
    if (bulat(awal.kadens) !== bulat(kini.kadens)) hasil.avg_cadence = bulat(kini.kadens);
    if (bulat(awal.langkah) !== bulat(kini.langkah)) hasil.step_count = bulat(kini.langkah);
  }

  return hasil;
};

/**
 * MET menurut kecepatan, cermin metFromSpeed di backend (utils/calories.ts,
 * Compendium 2011), supaya taksiran di layar sama dengan yang tersimpan.
 */
const MET_LARI: [number, number][] = [
  [6.4, 6.0],
  [8.0, 8.3],
  [8.4, 9.0],
  [9.7, 9.8],
  [10.8, 10.5],
  [11.3, 11.0],
  [12.1, 11.5],
  [12.9, 11.8],
  [13.8, 12.3],
  [14.5, 12.8],
  [16.1, 14.5],
  [17.7, 16.0],
  [19.3, 19.0],
  [20.9, 19.8],
  [22.5, 23.0],
];
const MET_JALAN: [number, number][] = [
  [3.2, 2.8],
  [4.0, 3.0],
  [4.8, 3.5],
  [5.6, 4.3],
  [6.4, 5.0],
  [7.2, 7.0],
  [8.0, 8.3],
];

const dua = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const metDariKecepatan = (jenis: DistanceKind, kmPerJam: number): number => {
  const tabel = jenis === 'RUN' ? MET_LARI : MET_JALAN;
  const pertama = tabel[0];
  const terakhir = tabel.at(-1);
  if (!pertama || !terakhir) return 1;
  if (kmPerJam <= pertama[0]) return pertama[1];
  if (kmPerJam >= terakhir[0]) return terakhir[1];
  for (let i = 1; i < tabel.length; i++) {
    const kanan = tabel[i];
    const kiri = tabel[i - 1];
    if (!kanan || !kiri) continue;
    if (kmPerJam <= kanan[0]) {
      return dua(kiri[1] + ((kmPerJam - kiri[0]) / (kanan[0] - kiri[0])) * (kanan[1] - kiri[1]));
    }
  }
  return terakhir[1];
};

/** Kalori lari atau jalan dari kecepatannya, cermin kaloriDariKecepatan di backend. */
export const kkalLariJalan = (
  r: RincianLari,
  jenis: DistanceKind,
  beratKg: number,
): number | null => {
  const jarak = angkaRincian(r.jarak);
  const detik = detikDurasi(r);
  if (jarak === null || detik === null) return null;
  const paceKetik = detikPaceDiketik(r);
  const menitBergerak = paceKetik !== null ? (paceKetik * jarak) / 60 : detik / 60;
  if (menitBergerak <= 0) return null;
  const met = metDariKecepatan(jenis, jarak / (menitBergerak / 60));
  const kkalPerMenit = dua(((met - 1) * 3.5 * 70) / 200);
  return Math.round((kkalPerMenit * menitBergerak * beratKg) / 70);
};

interface DistanceFieldsProps {
  value: RincianLari;
  onChange: (value: RincianLari) => void;
  /** Kolom sesudah isian ini, untuk tombol Berikutnya di kolom terakhir. */
  next?: RefObject<TextInput | null>;
}

/** Isian lari dan jalan. Detail di luar jarak, durasi, pace, dan HR dilipat. */
export const DistanceFields = ({ value, onChange, next }: DistanceFieldsProps) => {
  const ubah = (sebagian: Partial<RincianLari>) => onChange({ ...value, ...sebagian });

  const kolomDurasiMenit = useRef<TextInput>(null);
  const kolomDurasiDetik = useRef<TextInput>(null);
  const kolomPaceMenit = useRef<TextInput>(null);
  const kolomPaceDetik = useRef<TextInput>(null);
  const kolomHr = useRef<TextInput>(null);
  const kolomHrMaks = useRef<TextInput>(null);
  const kolomKadens = useRef<TextInput>(null);
  const kolomLangkah = useRef<TextInput>(null);
  const kolomElevasi = useRef<TextInput>(null);
  const kolomTe = useRef<TextInput>(null);

  const adaDetail =
    value.hrMaks !== '' ||
    value.kadens !== '' ||
    value.langkah !== '' ||
    value.elevasi !== '' ||
    value.te !== '';
  const [lipat, setLipat] = useState(!adaDetail);
  const tampilDetail = adaDetail || !lipat;

  const otomatis = paceOtomatis(value);
  const [paceMenitAuto, paceDetikAuto] = pisah(otomatis);

  const angkaSaja = (teks: string) => teks.replace(/[^0-9]/g, '');

  return (
    <View style={styles.wrap}>
      <Input
        label="Jarak"
        value={value.jarak}
        onChangeText={(jarak) => ubah({ jarak: jarak.replace(/[^0-9.,]/g, '') })}
        keyboardType="decimal-pad"
        suffix="km"
        placeholder="3,92"
        next={kolomDurasiMenit}
      />

      <Text variant="overline" tone="tertiary">
        Durasi
      </Text>
      <View style={styles.baris}>
        <View style={styles.kolom}>
          <Input
            ref={kolomDurasiMenit}
            next={kolomDurasiDetik}
            value={value.durasiMenit}
            onChangeText={(durasiMenit) => ubah({ durasiMenit: angkaSaja(durasiMenit) })}
            keyboardType="number-pad"
            suffix="mnt"
            placeholder="44"
          />
        </View>
        <View style={styles.kolom}>
          <Input
            ref={kolomDurasiDetik}
            next={kolomPaceMenit}
            value={value.durasiDetik}
            onChangeText={(durasiDetik) => ubah({ durasiDetik: angkaSaja(durasiDetik) })}
            keyboardType="number-pad"
            suffix="dtk"
            placeholder="0"
            maxLength={2}
          />
        </View>
      </View>

      <Text variant="overline" tone="tertiary">
        Pace per km
      </Text>
      <View style={styles.baris}>
        <View style={styles.kolom}>
          <Input
            ref={kolomPaceMenit}
            next={kolomPaceDetik}
            value={value.paceMenit}
            onChangeText={(paceMenit) => ubah({ paceMenit: angkaSaja(paceMenit) })}
            keyboardType="number-pad"
            suffix="mnt"
            placeholder={paceMenitAuto}
          />
        </View>
        <View style={styles.kolom}>
          <Input
            ref={kolomPaceDetik}
            next={kolomHr}
            value={value.paceDetik}
            onChangeText={(paceDetik) => ubah({ paceDetik: angkaSaja(paceDetik) })}
            keyboardType="number-pad"
            suffix="dtk"
            placeholder={paceDetikAuto}
            maxLength={2}
          />
        </View>
      </View>
      {/* Muncul cuma kalau pacenya kosong dan bisa dihitung: itu yang akan disimpan. */}
      {otomatis !== null && value.paceMenit === '' && value.paceDetik === '' ? (
        <Text variant="caption" tone="tertiary">
          Kosong berarti dihitung dari durasi dan jarak: {pace(otomatis)}/km.
        </Text>
      ) : null}

      <Input
        ref={kolomHr}
        next={tampilDetail ? kolomHrMaks : next}
        label="HR rata-rata"
        value={value.hr}
        onChangeText={(hr) => ubah({ hr: angkaSaja(hr) })}
        keyboardType="number-pad"
        suffix="bpm"
        placeholder="Opsional"
      />

      {tampilDetail ? (
        <>
          <View style={styles.baris}>
            <View style={styles.kolom}>
              <Input
                ref={kolomHrMaks}
                next={kolomKadens}
                label="HR maks"
                value={value.hrMaks}
                onChangeText={(hrMaks) => ubah({ hrMaks: angkaSaja(hrMaks) })}
                keyboardType="number-pad"
                suffix="bpm"
              />
            </View>
            <View style={styles.kolom}>
              <Input
                ref={kolomKadens}
                next={kolomLangkah}
                label="Kadens"
                value={value.kadens}
                onChangeText={(kadens) => ubah({ kadens: angkaSaja(kadens) })}
                keyboardType="number-pad"
                suffix="spm"
              />
            </View>
          </View>
          <View style={styles.baris}>
            <View style={styles.kolom}>
              <Input
                ref={kolomLangkah}
                next={kolomElevasi}
                label="Langkah"
                value={value.langkah}
                onChangeText={(langkah) => ubah({ langkah: angkaSaja(langkah) })}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.kolom}>
              <Input
                ref={kolomElevasi}
                next={kolomTe}
                label="Elevasi"
                value={value.elevasi}
                onChangeText={(elevasi) => ubah({ elevasi: angkaSaja(elevasi) })}
                keyboardType="number-pad"
                suffix="m"
              />
            </View>
          </View>
          <Input
            ref={kolomTe}
            next={next}
            label="Training stress aerobik"
            value={value.te}
            onChangeText={(te) => ubah({ te: te.replace(/[^0-9.,]/g, '') })}
            keyboardType="decimal-pad"
            placeholder="Mis. 3,1"
          />
        </>
      ) : (
        <Pressable onPress={() => setLipat(false)} hitSlop={8}>
          <Text variant="label" tone="secondary">
            + Detail lain: HR maks, kadens, langkah, elevasi
          </Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  baris: { flexDirection: 'row', gap: spacing.md },
  kolom: { flex: 1 },
});
