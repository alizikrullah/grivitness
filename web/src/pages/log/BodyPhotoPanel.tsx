import { CameraIcon, RulerIcon, SparkleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { AuthImage } from '@/components/features/AuthImage';
import { PhotoPicker } from '@/components/features/PhotoPicker';
import {
  Button,
  Card,
  Chip,
  DateField,
  EmptyState,
  ErrorNote,
  Input,
  Loading,
  SectionHeader,
} from '@/components/ui';
import { colors, metricColors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import {
  useBodyComparison,
  useBodyPhotoDate,
  useBodyPhotoRange,
  useCreateBodyPhoto,
  useDeleteBodyPhoto,
  useRequestComparison,
} from '@/services/body-photos.service';
import { useMeasurementDate, useSaveMeasurement } from '@/services/measurements.service';
import type { BodyDirection } from '@/types';
import { dayPhrase, shiftDays, shortDate, todayWIB } from '@/utils/date';
import { toNum } from '@/utils/format';
import { LogActions } from './LogActions';

/** Label arah, sengaja kata biasa dan bukan angka. */
const ARAH_LABEL: Record<BodyDirection, string> = {
  LEANER: 'Terlihat lebih ramping',
  SAME: 'Terlihat sama',
  FULLER: 'Terlihat lebih berisi',
  UNCLEAR: 'Tidak bisa dibandingkan',
};

export const BodyPhotoPanel = () => {
  /** Tanggal yang sedang dilihat. Bawaannya hari ini. */
  const [tanggal, setTanggal] = useState(todayWIB());

  const hariIni = todayWIB();

  const today = useBodyPhotoDate(tanggal);
  // Setahun ke belakang: ini catatan bulanan, dan perbandingannya paling
  // berguna untuk rentang yang panjang.
  const riwayat = useBodyPhotoRange(shiftDays(hariIni, -364), hariIni);
  const create = useCreateBodyPhoto();
  const hapus = useDeleteBodyPhoto();

  const pinggangHariIni = useMeasurementDate(tanggal);
  const simpanPinggang = useSaveMeasurement();

  const [depan, setDepan] = useState<File | null>(null);
  const [samping, setSamping] = useState<File | null>(null);
  const [pinggang, setPinggang] = useState('');
  const [pinggangDisentuh, setPinggangDisentuh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesanPinggang, setPesanPinggang] = useState<string | null>(null);

  /**
   * Isian dilepas saat pindah tanggal, disesuaikan saat render dan bukan
   * lewat useEffect. Tanpa ini foto untuk hari ini ikut terbawa dan tersimpan
   * ke tanggal yang salah.
   */
  const [tanggalTerakhir, setTanggalTerakhir] = useState(tanggal);
  if (tanggal !== tanggalTerakhir) {
    setTanggalTerakhir(tanggal);
    setDepan(null);
    setSamping(null);
    setPinggang('');
    setPinggangDisentuh(false);
    setError(null);
    setPesanPinggang(null);
  }

  // Pinggang yang sudah tercatat untuk tanggal itu dibuka di kolomnya.
  const pinggangTampil =
    pinggangDisentuh || !pinggangHariIni.data
      ? pinggang
      : String(toNum(pinggangHariIni.data.waist_cm) ?? '');

  const simpan = () => {
    setError(null);

    if (!depan || !samping) {
      setError('Butuh foto tampak depan dan tampak samping');
      return;
    }

    create.mutate(
      // Dicatat ke tanggal yang sedang dilihat, bukan selalu ke hari ini.
      { front: depan, side: samping, logged_at: tanggal },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          setDepan(null);
          setSamping(null);
        },
      },
    );
  };

  const simpanUkuran = () => {
    const angka = Number(pinggangTampil.replace(',', '.'));

    if (!Number.isFinite(angka) || angka < 30 || angka > 300) {
      setPesanPinggang('Isi lingkar pinggang antara 30 dan 300 cm');
      return;
    }

    simpanPinggang.mutate(
      { waist_cm: angka, logged_at: tanggal },
      {
        onSuccess: () => setPesanPinggang('Lingkar pinggang tersimpan'),
        onError: (e) => setPesanPinggang(toApiError(e).message),
      },
    );
  };

  return (
    <>
      <SectionHeader title={'Foto badan & pinggang ' + dayPhrase(tanggal)} />

      <DateField value={tanggal} onChange={setTanggal} />

      <Card variant="outline" padding="md">
        <span className="t-caption c-secondary">
          Cukup 2-4 minggu sekali. Foto di tempat, jarak, dan pencahayaan yang sama setiap kali,
          perubahan bentuk badan baru terlihat kalau kondisinya konsisten.
        </span>
      </Card>

      <Card>
        <div className="stack">
          <div className="grid-2">
            <PhotoPicker label="Tampak depan" file={depan} onPick={setDepan} />
            <PhotoPicker label="Tampak samping" file={samping} onPick={setSamping} />
          </div>

          {error ? <ErrorNote message={error} /> : null}

          {/*
            Dua gambar sekaligus adalah permintaan terberat di aplikasi ini, dan
            paling sering menabrak batas 8.000 token per menit milik Groq versi
            gratis. Diberitahukan di depan supaya kegagalannya tidak terbaca
            sebagai aplikasi yang rusak.
          */}
          {create.isPending ? (
            <span className="t-caption c-secondary">
              Menganalisa dua foto sekaligus… ini yang paling lama, bisa sampai tiga menit.
            </span>
          ) : (
            <span className="t-caption c-tertiary">
              Analisa dua foto memakai kuota AI paling besar. Kalau baru saja memotret makanan, beri
              jeda semenit dulu.
            </span>
          )}

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

      {/*
        Lingkar pinggang, angka keras yang mendampingi foto. Dari semua lingkar
        badan cuma ini yang punya bukti kuat, dan cuma ini yang berguna saat
        timbangan macet.
      */}
      <Card>
        <div className="stack">
          <div className="row-start">
            <RulerIcon size={18} color={metricColors.measurements} weight="duotone" />
            <span className="t-label">Lingkar pinggang {dayPhrase(tanggal)}</span>
          </div>

          <Input
            inputMode="decimal"
            value={pinggangTampil}
            onChange={(e) => {
              setPinggang(e.target.value);
              setPinggangDisentuh(true);
              setPesanPinggang(null);
            }}
            placeholder="90"
            suffix="cm"
            hint="Ukur setinggi pusar, sebelum makan, pita tidak menekan kulit. Angka ini pengukuran betulan, bukan tebakan."
          />

          {pesanPinggang ? (
            <span
              className={
                't-caption ' +
                (pesanPinggang === 'Lingkar pinggang tersimpan' ? 'c-success' : 'c-warning')
              }
            >
              {pesanPinggang}
            </span>
          ) : null}

          <Button
            label={pinggangHariIni.data ? 'Perbarui pinggang' : 'Simpan pinggang'}
            variant="secondary"
            onClick={simpanUkuran}
            loading={simpanPinggang.isPending}
            disabled={pinggangTampil.trim() === ''}
          />
        </div>
      </Card>

      <Perbandingan tanggalTersedia={(riwayat.data ?? []).map((f) => f.logged_at)} />

      {today.data ? (
        <>
          <SectionHeader title={'Foto ' + dayPhrase(tanggal)} />
          <Card>
            <div className="stack-sm">
              <div className="grid-2">
                <AuthImage path={today.data.front_photo_url} alt="Tampak depan" height={260} />
                <AuthImage path={today.data.side_photo_url} alt="Tampak samping" height={260} />
              </div>

              {today.data.ai_analysis?.visible_changes ? (
                <span className="t-caption c-secondary">
                  {today.data.ai_analysis.visible_changes}
                </span>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}

      <SectionHeader title="Riwayat" />

      {riwayat.isPending ? (
        <Loading />
      ) : (riwayat.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<CameraIcon size={28} color={colors.textTertiary} weight="duotone" />}
          title="Belum ada foto badan"
          message="Foto berkala jauh lebih jujur daripada angka timbangan."
        />
      ) : (
        <div className="grid-3">
          {riwayat.data?.map((foto) => (
            <Card key={foto.id} padding="md">
              <div className="stack-sm">
                <AuthImage
                  path={foto.front_photo_url}
                  alt={'Foto ' + foto.logged_at}
                  height={200}
                />
                <div className="row-between">
                  <span className="t-caption c-secondary">{shortDate(foto.logged_at)}</span>
                  <LogActions
                    onDelete={() =>
                      hapus.mutate(foto.id, { onError: (e) => setError(toApiError(e).message) })
                    }
                    confirmMessage={'Hapus foto badan ' + shortDate(foto.logged_at) + '?'}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};

/**
 * Perbandingan dua tanggal berdampingan. Padanan komponen mobile.
 *
 * Inilah fungsi asli progress photo: user melihat sendiri foto bulan ini di
 * samping foto bulan lalu, dengan lingkar pinggang di bawahnya sebagai angka
 * kerasnya. Kesan AI di bawahnya cuma suara kedua: kalimat, bukan angka,
 * dipanggil hanya saat tombolnya ditekan.
 */
const Perbandingan = ({ tanggalTersedia }: { tanggalTersedia: string[] }) => {
  const urut = [...tanggalTersedia].sort();
  const terbaru = urut[urut.length - 1] ?? null;
  const sebelumnya = urut.length >= 2 ? (urut[urut.length - 2] ?? null) : null;

  const [dari, setDari] = useState<string | null>(null);
  const [ke, setKe] = useState<string | null>(null);

  const from = dari ?? sebelumnya;
  const to = ke ?? terbaru;

  const tampilan = useBodyComparison(from, to);
  const minta = useRequestComparison();
  const [error, setError] = useState<string | null>(null);

  if (urut.length < 2) {
    return (
      <>
        <SectionHeader title="Bandingkan" />
        <Card variant="outline" padding="md">
          <span className="t-caption c-tertiary">
            Perbandingan muncul setelah ada foto di dua tanggal berbeda. Foto berikutnya 2-4 minggu
            lagi, di tempat dan pencahayaan yang sama.
          </span>
        </Card>
      </>
    );
  }

  const d = tampilan.data;
  const pendapat = d?.comparison ?? null;

  const pinggang = (nilai: string | null) => {
    const angka = toNum(nilai);
    return angka === null ? 'pinggang belum diukur' : `pinggang ${angka} cm`;
  };

  return (
    <>
      <SectionHeader title="Bandingkan" />

      <Card>
        <div className="stack">
          <div className="stack-xs">
            <span className="t-caption c-tertiary">Sebelum</span>
            <div className="chip-group">
              {urut
                .filter((t) => to === null || t < to)
                .map((t) => (
                  <Chip
                    key={t}
                    label={shortDate(t)}
                    active={t === from}
                    onClick={() => setDari(t)}
                  />
                ))}
            </div>
          </div>

          <div className="stack-xs">
            <span className="t-caption c-tertiary">Sesudah</span>
            <div className="chip-group">
              {urut
                .filter((t) => from === null || t > from)
                .map((t) => (
                  <Chip key={t} label={shortDate(t)} active={t === to} onClick={() => setKe(t)} />
                ))}
            </div>
          </div>

          {tampilan.isPending ? (
            <Loading />
          ) : d ? (
            <>
              <div className="grid-2">
                <div className="stack-xs">
                  <AuthImage
                    path={d.from.photo?.front_photo_url ?? null}
                    alt="Tampak depan, sebelum"
                    height={320}
                  />
                  <span className="t-caption c-secondary">{shortDate(d.from.date)}</span>
                  <span className="t-caption c-tertiary">{pinggang(d.from.waist_cm)}</span>
                </div>
                <div className="stack-xs">
                  <AuthImage
                    path={d.to.photo?.front_photo_url ?? null}
                    alt="Tampak depan, sesudah"
                    height={320}
                  />
                  <span className="t-caption c-secondary">{shortDate(d.to.date)}</span>
                  <span className="t-caption c-tertiary">{pinggang(d.to.waist_cm)}</span>
                </div>
              </div>

              <div className="grid-2">
                <AuthImage
                  path={d.from.photo?.side_photo_url ?? null}
                  alt="Tampak samping, sebelum"
                  height={320}
                />
                <AuthImage
                  path={d.to.photo?.side_photo_url ?? null}
                  alt="Tampak samping, sesudah"
                  height={320}
                />
              </div>

              {pendapat ? (
                <Card variant="outline" padding="md">
                  <div className="stack-xs">
                    <div className="row-start">
                      <SparkleIcon size={16} color={colors.primary} weight="duotone" />
                      <span className="t-label">{ARAH_LABEL[pendapat.direction]}</span>
                    </div>
                    <span className="t-caption c-secondary">{pendapat.opinion}</span>
                    <span className="t-caption c-tertiary">
                      Kesan AI dari foto. Pendapat, bukan pengukuran. Yang menentukan tetap matamu
                      dan pita di pinggang.
                    </span>
                  </div>
                </Card>
              ) : null}

              {error ? <ErrorNote message={error} /> : null}

              <Button
                label={pendapat ? 'Minta kesan AI lagi' : 'Minta kesan AI'}
                variant="secondary"
                onClick={() => {
                  if (!from || !to) return;
                  setError(null);
                  minta.mutate({ from, to }, { onError: (e) => setError(toApiError(e).message) });
                }}
                loading={minta.isPending}
                disabled={!d.from.photo || !d.to.photo}
              />
            </>
          ) : null}
        </div>
      </Card>
    </>
  );
};
