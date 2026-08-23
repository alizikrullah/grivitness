import { CameraIcon, SparkleIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { AuthImage } from '@/components/features/AuthImage';
import { PhotoPicker } from '@/components/features/PhotoPicker';
import { Button, Card, EmptyState, ErrorNote, Loading, SectionHeader } from '@/components/ui';
import { colors } from '@/constants/colors';
import { toApiError } from '@/lib/api';
import {
  useBodyPhotoRange,
  useBodyPhotoToday,
  useCreateBodyPhoto,
  useDeleteBodyPhoto,
} from '@/services/body-photos.service';
import { shiftDays, shortDate, todayWIB } from '@/utils/date';
import { LogActions } from './LogActions';

export const BodyPhotoPanel = () => {
  const hariIni = todayWIB();

  const today = useBodyPhotoToday();
  const riwayat = useBodyPhotoRange(shiftDays(hariIni, -89), hariIni);
  const create = useCreateBodyPhoto();
  const hapus = useDeleteBodyPhoto();

  const [depan, setDepan] = useState<File | null>(null);
  const [samping, setSamping] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    if (!depan || !samping) {
      setError('Butuh foto tampak depan dan tampak samping');
      return;
    }

    create.mutate(
      { front: depan, side: samping },
      {
        onError: (e) => setError(toApiError(e).message),
        onSuccess: () => {
          setDepan(null);
          setSamping(null);
        },
      },
    );
  };

  return (
    <>
      <SectionHeader title="Foto badan" />

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
              Analisa dua foto memakai kuota AI paling besar. Kalau baru saja memotret makanan,
              beri jeda semenit dulu.
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

      {today.data ? (
        <>
          <SectionHeader title="Hari ini" />
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

              {today.data.ai_analysis?.estimated_body_fat_percent != null ? (
                <span className="t-caption c-tertiary">
                  Perkiraan lemak tubuh {today.data.ai_analysis.estimated_body_fat_percent}% —
                  taksiran kasar dari foto, bukan pengukuran.
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
                <AuthImage path={foto.front_photo_url} alt={'Foto ' + foto.logged_at} height={200} />
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
