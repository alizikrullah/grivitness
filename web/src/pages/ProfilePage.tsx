import { PencilSimpleIcon, TargetIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { PlanCard } from '@/components/features/PlanCard';
import { Button, Card, Divider, ErrorNote, Input, Loading, Modal, Row, SectionHeader } from '@/components/ui';
import { colors } from '@/constants/colors';
import { ACTIVITY_HINT, ACTIVITY_LABEL, ACTIVITY_OPTIONS, GENDER_LABEL, GENDER_OPTIONS } from '@/constants/labels';
import { toApiError } from '@/lib/api';
import { useActiveGoal, useCreateGoal, useDailySummary } from '@/services/misc.service';
import { useProfile, useSaveProfile } from '@/services/users.service';
import type { ActivityLevel, Gender, Profile } from '@/types';
import { longDate, shiftDays, todayWIB } from '@/utils/date';
import { kg, thousands, toNum } from '@/utils/format';
import './ProfilePage.css';

export const ProfilePage = () => {
  const profile = useProfile();
  const goal = useActiveGoal();
  const summary = useDailySummary(todayWIB());

  const [sheetProfil, setSheetProfil] = useState(false);
  const [sheetGoal, setSheetGoal] = useState(false);

  const p = profile.data;

  return (
    <div className="stack">
      <SectionHeader
        title="Profil"
        action={
          <Button
            label={p ? 'Ubah' : 'Isi profil'}
            variant="secondary"
            size="sm"
            icon={<PencilSimpleIcon size={14} weight="bold" />}
            onClick={() => setSheetProfil(true)}
          />
        }
      />

      {profile.isPending ? (
        <Loading />
      ) : !p ? (
        <Card variant="outline" onClick={() => setSheetProfil(true)}>
          <div className="stack-xs">
            <span className="t-label">Profil belum diisi</span>
            <span className="t-caption c-secondary">
              Tanpa tinggi badan dan usia, kebutuhan kalori harian tidak bisa dihitung.
            </span>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="stack-sm">
            <div className="grid-3">
              <Stat label="Usia" value={p.age + ' th'} />
              <Stat label="Tinggi" value={kg(p.height_cm, 0) + ' cm'} />
              <Stat label="Berat" value={p.current_weight_kg ? kg(p.current_weight_kg) + ' kg' : '—'} />
            </div>

            <Divider />

            <Row label="Jenis kelamin" value={GENDER_LABEL[p.gender]} />
            <Row label="Pekerjaan" value={ACTIVITY_LABEL[p.activity_level]} />
            <Row label="BMR" value={p.bmr === null ? 'Butuh data berat' : thousands(p.bmr) + ' kkal'} />
            <Row
              label="Pengeluaran hari biasa"
              value={p.tdee === null ? 'Butuh data berat' : thousands(p.tdee) + ' kkal'}
              tone="accent"
            />

            {/*
              "TDEE" tanpa penjelasan terbaca seperti angka mutlak. Padahal ini
              acuan hari biasa — tanpa olahraga, dengan gerak seadanya — dan
              sengaja begitu supaya jatah kalori tidak naik-turun mengikuti
              aktivitas hari itu.
            */}
            <span className="t-caption c-tertiary">
              Hitungan hari biasa: tidur normal, tanpa olahraga. Hari yang lebih aktif dihitung
              sendiri di beranda.
            </span>
          </div>
        </Card>
      )}

      <SectionHeader
        title="Target"
        action={
          <Button
            label={goal.data ? 'Ubah target' : 'Buat target'}
            variant="secondary"
            size="sm"
            icon={<TargetIcon size={14} weight="bold" />}
            onClick={() => setSheetGoal(true)}
          />
        }
      />

      {goal.data ? (
        <>
          <Card>
            <div className="row">
              <span className="profile-goal-icon">
                <TargetIcon size={24} color={colors.primary} weight="duotone" />
              </span>

              <div className="stack-xs flex-1">
                <span className="t-label">{kg(goal.data.target_weight_kg)} kg</span>
                <span className="t-caption c-secondary">
                  Target {longDate(goal.data.target_date)} · sisa {goal.data.days_remaining} hari
                </span>
                <span className="t-caption c-accent">
                  Jatah {thousands(goal.data.daily_calorie_budget)} kkal per hari
                </span>
              </div>
            </div>
          </Card>

          <PlanCard goal={goal.data} targets={summary.data?.targets} />
        </>
      ) : (
        <Card variant="outline" onClick={() => setSheetGoal(true)}>
          <div className="stack-xs">
            <span className="t-label">Belum ada target</span>
            <span className="t-caption c-secondary">
              Tetapkan target berat supaya jatah kalori harian bisa dihitung.
            </span>
          </div>
        </Card>
      )}

      {/* Pengingat sengaja TIDAK ada di web. Notifikasi terjadwal di browser
          butuh service worker yang hanya hidup selama tab terbuka — janji yang
          tidak bisa ditepati. Pengingat tetap diatur dari aplikasi mobile. */}
      <Card variant="outline" padding="md">
        <span className="t-caption c-tertiary">
          Pengaturan pengingat ada di aplikasi mobile. Notifikasi terjadwal di browser hanya
          berjalan selama tab ini terbuka, jadi tidak ditawarkan di sini.
        </span>
      </Card>

      {sheetProfil && !profile.isPending ? (
        <ProfileModal profile={p ?? null} onClose={() => setSheetProfil(false)} />
      ) : null}
      {sheetGoal ? <GoalModal onClose={() => setSheetGoal(false)} /> : null}
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="stack-xs">
    <span className="t-overline c-tertiary">{label}</span>
    <span className="t-h3">{value}</span>
  </div>
);

/**
 * Profil diterima sebagai PROP, bukan diambil ulang di dalam.
 *
 * Dengan begitu nilai awal formulir bisa diisi langsung lewat useState, dan
 * tidak perlu useEffect yang memanggil setState — pola yang memaksa render
 * kedua dan, kalau datanya datang belakangan, sempat menampilkan angka bawaan
 * yang salah sebelum tertimpa.
 *
 * Pemanggil hanya merender komponen ini setelah query-nya selesai, jadi nilai
 * awalnya dijamin sudah benar sejak render pertama.
 */
const ProfileModal = ({ profile, onClose }: { profile: Profile | null; onClose: () => void }) => {
  const save = useSaveProfile(profile ? 'update' : 'create');

  const [tinggi, setTinggi] = useState(() => String(toNum(profile?.height_cm) ?? 170));
  const [lahir, setLahir] = useState(() => profile?.birth_date ?? '1996-01-01');
  const [gender, setGender] = useState<Gender>(() => profile?.gender ?? 'MALE');
  const [aktivitas, setAktivitas] = useState<ActivityLevel>(
    () => profile?.activity_level ?? 'SEDENTARY',
  );
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    const tinggiAngka = Number(tinggi);

    if (!Number.isFinite(tinggiAngka) || tinggiAngka < 100 || tinggiAngka > 250) {
      setError('Tinggi badan harus antara 100 sampai 250 cm');
      return;
    }

    save.mutate(
      {
        height_cm: tinggiAngka,
        birth_date: lahir,
        gender,
        activity_level: aktivitas,
      },
      { onError: (e) => setError(toApiError(e).message), onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      title="Profil"
      onClose={onClose}
      footer={<Button label="Simpan" size="lg" full onClick={simpan} loading={save.isPending} />}
    >
      <Input
        label="Tinggi badan"
        inputMode="decimal"
        value={tinggi}
        onChange={(e) => setTinggi(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
        suffix="cm"
      />

      <Input
        label="Tanggal lahir"
        type="date"
        value={lahir}
        onChange={(e) => setLahir(e.target.value)}
      />

      <div className="stack-xs">
        <span className="t-label c-secondary">Jenis kelamin</span>
        <div className="chip-group">
          {GENDER_OPTIONS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              aria-pressed={gender === g}
              className={'chip' + (gender === g ? ' chip-active' : '')}
            >
              {GENDER_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="stack-xs">
        <span className="t-label c-secondary">Pekerjaan sehari-hari</span>

        {/*
          Pertanyaannya sengaja soal pekerjaan, bukan seberapa sering olahraga.
          Olahraga, langkah, dan tidur sudah dihitung terpisah dari data yang
          dicatat — kalau ditanyakan lagi di sini, jam yang sama dihitung dua
          kali dan targetnya jadi terlalu longgar.
        */}
        <span className="t-caption c-tertiary">
          Olahraga tidak perlu dihitung di sini — itu sudah diambil dari catatan olahraga, langkah,
          dan tidurmu.
        </span>

        <div className="stack-xs">
          {ACTIVITY_OPTIONS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setAktivitas(level)}
              aria-pressed={aktivitas === level}
              className={'profile-level' + (aktivitas === level ? ' profile-level-active' : '')}
            >
              <span className="stack-xs flex-1">
                <span className={'t-label ' + (aktivitas === level ? 'c-accent' : '')}>
                  {ACTIVITY_LABEL[level]}
                </span>
                <span className="t-caption c-secondary">{ACTIVITY_HINT[level]}</span>
              </span>
              <span className={'profile-radio' + (aktivitas === level ? ' profile-radio-on' : '')} />
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorNote message={error} /> : null}
    </Modal>
  );
};

const GoalModal = ({ onClose }: { onClose: () => void }) => {
  const create = useCreateGoal();

  const [target, setTarget] = useState('70');
  const [tanggal, setTanggal] = useState(shiftDays(todayWIB(), 90));
  const [error, setError] = useState<string | null>(null);

  const simpan = () => {
    setError(null);

    const angka = Number(target);

    if (!Number.isFinite(angka) || angka < 20 || angka > 400) {
      setError('Target berat harus antara 20 sampai 400 kg');
      return;
    }

    if (tanggal <= todayWIB()) {
      setError('Tanggal target harus setelah hari ini');
      return;
    }

    create.mutate(
      { target_weight_kg: angka, target_date: tanggal },
      { onError: (e) => setError(toApiError(e).message), onSuccess: onClose },
    );
  };

  return (
    <Modal
      open
      title="Target berat badan"
      onClose={onClose}
      footer={
        <Button label="Simpan target" size="lg" full onClick={simpan} loading={create.isPending} />
      }
    >
      <Input
        label="Target berat"
        inputMode="decimal"
        value={target}
        onChange={(e) => setTarget(e.target.value.replace(',', '.').replace(/[^0-9.]/g, ''))}
        suffix="kg"
      />

      <Input
        label="Target tanggal"
        type="date"
        value={tanggal}
        onChange={(e) => setTanggal(e.target.value)}
      />

      <span className="t-caption c-tertiary">
        Jatah kalori dihitung otomatis dan ditahan di batas aman. Kalau targetnya terlalu cepat,
        kamu akan diberi tahu tanggal realistisnya, bukan dipaksa mengikuti angka yang berbahaya.
      </span>

      {error ? <ErrorNote message={error} /> : null}
    </Modal>
  );
};
