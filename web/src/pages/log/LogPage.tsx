import {
  BarbellIcon,
  CameraIcon,
  DropIcon,
  FootprintsIcon,
  ForkKnifeIcon,
  MoonStarsIcon,
  ScalesIcon,
  SmileyIcon,
  WatchIcon,
} from '@phosphor-icons/react';
import { type ComponentType, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { CalendarModal } from '@/components/features/CalendarModal';
import { WeekStrip } from '@/components/features/WeekStrip';
import { Card, Checkbox, IconCircle } from '@/components/ui';
import { metricColors } from '@/constants/colors';
import { useTanggalLog } from '@/hooks/useTanggalLog';
import { useCalendarDays, useDailySummary, useSetSickDay } from '@/services/misc.service';
import type { DailySummary, LoggedFlags } from '@/types';
import {
  dayPhrase,
  navDateLabel,
  shiftDays,
  shortDate,
  sleepDayNow,
  weekdayMon,
} from '@/utils/date';
import { duration, kg, thousands, volume } from '@/utils/format';
import { BodyPhotoPanel } from './BodyPhotoPanel';
import { DeviceEnergyPanel } from './DeviceEnergyPanel';
import { FoodPanel } from './FoodPanel';
import { MoodPanel } from './MoodPanel';
import { SleepPanel } from './SleepPanel';
import { StepsPanel } from './StepsPanel';
import { WaterPanel } from './WaterPanel';
import { WeightPanel } from './WeightPanel';
import { WorkoutPanel } from './WorkoutPanel';
import './LogPage.css';

interface JenisCatat {
  slug: string;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; weight?: 'duotone' | 'fill' }>;
  color: string;
  Panel: ComponentType;
  /** Penanda di DailySummary.logged. */
  kunci: keyof LoggedFlags;
  /** Catatan harian: ikut menentukan lengkap tidaknya hari. */
  harian: boolean;
  /** Keadaannya di tanggal terpilih, dipakai kalau sudah diisi. */
  status: (d: DailySummary) => string;
  /** Teks kalau belum diisi, bawaan "Belum diisi". */
  kosong?: string;
}

/**
 * Enam yang pertama catatan HARIAN: makanan, minum, tidur, langkah, mood, jam
 * tangan. Sisanya tidak membuat hari terbaca bolong: berat ditimbang 2-4 kali
 * seminggu, olahraga punya hari istirahat, foto badan bulanan. Aturan yang
 * sama dipakai backend untuk titik kalender (getCalendar, type catat).
 */
const JENIS: JenisCatat[] = [
  {
    slug: 'food',
    label: 'Makanan',
    icon: ForkKnifeIcon,
    color: metricColors.calories,
    Panel: FoodPanel,
    kunci: 'food',
    harian: true,
    status: (d) => thousands(d.calories_in) + ' kkal',
  },
  {
    slug: 'water',
    label: 'Minum',
    icon: DropIcon,
    color: metricColors.water,
    Panel: WaterPanel,
    kunci: 'water',
    harian: true,
    // Angka dan targetnya, supaya 500 ml di siang hari kelihatan masih jauh.
    status: (d) => volume(d.water_ml) + ' dari ' + volume(d.targets.water_ml),
  },
  {
    slug: 'sleep',
    label: 'Tidur',
    icon: MoonStarsIcon,
    color: metricColors.sleep,
    Panel: SleepPanel,
    kunci: 'sleep',
    harian: true,
    status: (d) => duration(d.sleep_minutes),
  },
  {
    slug: 'steps',
    label: 'Langkah',
    icon: FootprintsIcon,
    color: metricColors.steps,
    Panel: StepsPanel,
    kunci: 'steps',
    harian: true,
    status: (d) => thousands(d.steps) + ' langkah',
  },
  {
    slug: 'mood',
    label: 'Mood',
    icon: SmileyIcon,
    color: metricColors.mood,
    Panel: MoodPanel,
    kunci: 'mood',
    harian: true,
    status: (d) => 'Skor ' + String(d.mood_score ?? '-') + '/5',
  },
  {
    slug: 'device-energy',
    label: 'Kalori jam',
    icon: WatchIcon,
    color: metricColors.device,
    Panel: DeviceEnergyPanel,
    kunci: 'device',
    harian: true,
    // Yang dihitung bagian AKTIF-nya, jadi itu yang disebut di sini.
    status: (d) =>
      d.energy?.device_active_kcal != null
        ? 'aktif ' + thousands(d.energy.device_active_kcal) + ' kkal'
        : thousands(d.device_kcal ?? 0) + ' kkal',
  },
  {
    slug: 'weight',
    label: 'Berat badan',
    icon: ScalesIcon,
    color: metricColors.weight,
    Panel: WeightPanel,
    kunci: 'weight',
    harian: false,
    status: (d) => kg(d.weight_kg, 1) + ' kg',
  },
  {
    slug: 'workout',
    label: 'Olahraga',
    icon: BarbellIcon,
    color: metricColors.workout,
    Panel: WorkoutPanel,
    kunci: 'workout',
    harian: false,
    // Durasi saja tidak menjawab yang dicari: berapa yang terbakar.
    status: (d) => duration(d.workout_minutes) + ' · ' + thousands(d.workout_calories) + ' kkal',
  },
  // Foto badan dan lingkar pinggang jadi satu panel, irama 2-4 minggu sekali.
  {
    slug: 'body-photo',
    label: 'Foto & pinggang',
    icon: CameraIcon,
    color: metricColors.measurements,
    Panel: BodyPhotoPanel,
    kunci: 'body_photo',
    harian: false,
    status: () => 'Sudah difoto',
    kosong: 'Cek 2-4 minggu sekali',
  },
];

const HARIAN = JENIS.filter((j) => j.harian);
const LAINNYA = JENIS.filter((j) => !j.harian);

/**
 * Halaman Catat: semua jenis catatan untuk SATU tanggal, daftar di kiri,
 * formulirnya di kanan.
 *
 * Header-nya menjawab "hari mana yang belum gua isi": tanggal terpilih, berapa
 * catatan harian yang terisi, dan strip sepekan yang titiknya hijau (lengkap)
 * atau kuning (baru sebagian). Tiap baris daftar menyebut keadaannya di
 * tanggal itu, dan panelnya membuka tanggal yang sama.
 *
 * Tanggalnya di alamat (?date=), dibaca header DAN panel lewat useTanggalLog,
 * jadi menggeser salah satunya ikut menggeser yang lain. Berbeda dari mobile
 * yang memberi satu layar penuh per jenis: di layar lebar, bolak-balik ke hub
 * setiap ganti jenis membuang ruang yang justru berlimpah.
 */
export const LogPage = () => {
  const { pathname, search } = useLocation();
  const slugAktif = pathname.split('/')[2] ?? '';
  // Tidur sore ini (18:00 ke atas) masuk tanggal besok, dan panel tidur boleh
  // maju ke sana. Header ikut selama panel tidur yang terbuka.
  const [tanggal, setTanggal] = useTanggalLog(slugAktif === 'sleep' ? sleepDayNow() : undefined);
  const [kalender, setKalender] = useState(false);

  const summary = useDailySummary(tanggal);
  const senin = shiftDays(tanggal, -weekdayMon(tanggal));
  const pekan = useCalendarDays('catat', senin, shiftDays(senin, 6));
  const kuning = new Set(pekan.data?.incomplete ?? []);
  const hijau = new Set((pekan.data?.dates ?? []).filter((t) => !kuning.has(t)));

  const d = summary.data;
  const setSakit = useSetSickDay();
  // Selama permintaan berjalan, tampilkan yang baru dipilih, bukan yang lama.
  const sakit = setSakit.isPending ? (setSakit.variables?.sick ?? false) : d?.sick != null;
  const terisi = d ? HARIAN.filter((j) => d.logged[j.kunci]).length : 0;
  const lengkap = d !== undefined && terisi === HARIAN.length;

  const baris = (j: JenisCatat) => {
    const { icon: Icon } = j;
    const ada = d?.logged[j.kunci] ?? false;
    // Catatan harian yang belum diisi dibuat oranye supaya menonjol; yang
    // tidak wajib tiap hari cukup redup.
    const nada = !d ? 'c-tertiary' : ada ? 'c-success' : j.harian ? 'c-warning' : 'c-tertiary';
    const teks = !d ? '…' : ada ? j.status(d) : (j.kosong ?? 'Belum diisi');

    return (
      <NavLink
        key={j.slug}
        to={{ pathname: '/log/' + j.slug, search }}
        className={({ isActive }) => 'log-nav-item' + (isActive ? ' log-nav-active' : '')}
      >
        {/* Wadah gelap, ikonnya yang berwarna metrik (section 11). */}
        <IconCircle size={34}>
          <Icon size={18} color={j.color} weight="fill" />
        </IconCircle>
        <span className="log-nav-text">
          <span className="t-label truncate">{j.label}</span>
          <span className={'t-caption truncate ' + nada}>{teks}</span>
        </span>
      </NavLink>
    );
  };

  return (
    <div className="stack">
      <Card className="log-head">
        <div className="log-head-text">
          <span className="t-overline c-tertiary">{navDateLabel(tanggal)}</span>
          <h1 className="t-h1 log-head-title">{lengkap ? 'Sudah lengkap' : 'Belum lengkap'}</h1>
          <span className="t-body c-secondary">
            {d
              ? `${String(terisi)} dari ${String(HARIAN.length)} catatan harian terisi.`
              : 'Memuat catatan ' + dayPhrase(tanggal) + '…'}
          </span>

          {/*
            Tanda sakit, cuma konteks untuk chat dan overview: tidak ada hitungan
            yang berubah. Dicentang di hari pertama, berlaku terus sampai
            centangnya dihilangkan di hari sembuh. Padanan mobile.
          */}
          <Checkbox
            label="Lagi sakit"
            checked={sakit}
            onChange={(nilai) => setSakit.mutate({ date: tanggal, sick: nilai })}
            hint={
              d?.sick
                ? 'Sakit sejak ' +
                  shortDate(d.sick.start_date) +
                  (d.sick.end_date ? ' sampai ' + shortDate(d.sick.end_date) : '') +
                  '. Hilangkan centang di hari kamu sembuh.'
                : undefined
            }
          />
        </div>

        <WeekStrip
          value={tanggal}
          onChange={setTanggal}
          onOpenCalendar={() => setKalender(true)}
          complete={hijau}
          partial={kuning}
        />
      </Card>

      <div className="log">
        <nav className="log-nav">
          <span className="t-overline c-tertiary log-nav-title">Catatan harian</span>
          {HARIAN.map(baris)}
          <span className="t-overline c-tertiary log-nav-title">Lainnya</span>
          {LAINNYA.map(baris)}
        </nav>

        <div className="log-panel">
          <Routes>
            <Route index element={<Navigate to={{ pathname: 'food', search }} replace />} />
            {JENIS.map(({ slug, Panel }) => (
              <Route key={slug} path={slug} element={<Panel />} />
            ))}
            {/* Slug yang tidak dikenal dikembalikan ke jenis pertama, bukan
                dibiarkan menampilkan panel kosong tanpa penjelasan. */}
            <Route path="*" element={<Navigate to={{ pathname: '/log/food', search }} replace />} />
          </Routes>
        </div>
      </div>

      <CalendarModal
        open={kalender}
        onClose={() => setKalender(false)}
        value={tanggal}
        section="catat"
        onSelect={(t) => {
          setTanggal(t);
          setKalender(false);
        }}
      />
    </div>
  );
};
