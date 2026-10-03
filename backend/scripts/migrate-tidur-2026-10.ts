/**
 * Migrasi satu kali untuk aturan hari tidur jam 18:00, Oktober 2026.
 *
 *   npx tsx scripts/migrate-tidur-2026-10.ts uji [folder]         cadangan + rencana, TIDAK menulis
 *   npx tsx scripts/migrate-tidur-2026-10.ts terapkan [folder]    tulis persis rencana
 *   npx tsx scripts/migrate-tidur-2026-10.ts kembalikan [folder]  pulihkan dari cadangan
 *
 * Folder bawaan ../../grivitness-cadangan, di LUAR repo: isinya catatan tidur
 * pemiliknya.
 *
 * Dua hal yang dikerjakan:
 *
 *   1. Sesi yang jam bangunnya BELUM TERJADI saat disimpan digeser mundur 24
 *      jam. Itu jejak form lama: tidur 21.00 sampai 23.00 diisi di tanggal 29
 *      tersimpan sebagai malam 29, padahal milik malam 28 (disimpan jam 19.50
 *      tanggal 29, saat malam 29 belum datang). Yang sesudah digeser masih di
 *      masa depan dibiarkan dan dilaporkan, bukan ditebak.
 *
 *   2. logged_at semua sesi dihitung ulang dengan sleepDay(): sesi yang mulai
 *      jam 18:00 ke atas masuk tanggal besoknya.
 *
 * Rencana menolak diterapkan kalau sesudahnya masih ada sesi yang bertabrakan.
 * `terapkan` melewati baris yang berubah sejak `uji`, supaya koreksi user di
 * antara keduanya tidak tertimpa.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readItems, updateItem } from '@directus/sdk';

import { directus } from '../src/config/directus.js';
import { sleepDay } from '../src/utils/daily-key.js';

const log = (pesan: string): void => {
  process.stdout.write(`${pesan}\n`);
};

const folder = resolve(process.argv[3] ?? '../../grivitness-cadangan');
const berkasRencana = resolve(folder, 'rencana-migrasi-tidur.json');

const SEHARI_MS = 86_400_000;

/** Sama dengan kelonggaran di sleep.service.ts. */
const KELONGGARAN_MS = 5 * 60_000;

interface BarisTidur {
  id: string;
  user_id: string;
  sleep_start: string;
  sleep_end: string;
  duration_minutes: number;
  logged_at: string;
  created_at: string;
}

type Waktu = Pick<BarisTidur, 'sleep_start' | 'sleep_end' | 'logged_at'>;

interface Perubahan {
  id: string;
  user_id: string;
  alasan: string[];
  sebelum: Waktu;
  sesudah: Waktu;
}

interface Rencana {
  dibuat: string;
  cadangan: string;
  perubahan: Perubahan[];
}

const wib = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const rentang = (w: Waktu): string =>
  `${wib.format(new Date(w.sleep_start))} -> ${wib.format(new Date(w.sleep_end))} (tidur ${w.logged_at})`;

const bacaSemua = async (): Promise<BarisTidur[]> =>
  (await directus.request(
    readItems('sleep_logs', {
      fields: [
        'id',
        'user_id',
        'sleep_start',
        'sleep_end',
        'duration_minutes',
        'logged_at',
        'created_at',
      ],
      sort: ['sleep_start'],
      limit: -1,
    }),
  )) as BarisTidur[];

/** Directus menyimpan timestamp tanpa zona; dibaca ulang lewat Date supaya seragam. */
const iso = (t: string): string => new Date(t).toISOString();

const geser = (t: string, ms: number): string => new Date(new Date(t).getTime() + ms).toISOString();

/** Pasangan sesi yang bertabrakan di satu user, setelah rencana diterapkan. */
const cariTabrakan = (baris: (Waktu & { id: string; user_id: string })[]): string[] => {
  const hasil: string[] = [];
  const urut = [...baris].sort((a, b) =>
    a.user_id === b.user_id
      ? new Date(a.sleep_start).getTime() - new Date(b.sleep_start).getTime()
      : a.user_id.localeCompare(b.user_id),
  );

  // Urut menurut jam mulai, tabrakan apa pun pasti juga muncul di pasangan
  // yang bersebelahan.
  let sebelumnya: (typeof urut)[number] | undefined;
  for (const sesi of urut) {
    const a = sebelumnya;
    sebelumnya = sesi;
    if (a?.user_id === sesi.user_id && new Date(sesi.sleep_start) < new Date(a.sleep_end)) {
      hasil.push(`${rentang(a)}  BERTABRAKAN  ${rentang(sesi)}`);
    }
  }

  return hasil;
};

const uji = async (): Promise<void> => {
  mkdirSync(folder, { recursive: true });
  const semua = await bacaSemua();

  const cadangan = resolve(
    folder,
    `sleep_logs-sebelum-migrasi-tidur-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(cadangan, JSON.stringify(semua, null, 2));
  log(`Cadangan ${semua.length} sesi tidur: ${cadangan}\n`);

  const perubahan: Perubahan[] = [];
  const dibiarkan: string[] = [];
  const sesudahSemua: (Waktu & { id: string; user_id: string })[] = [];

  for (const b of semua) {
    const sebelum: Waktu = {
      sleep_start: iso(b.sleep_start),
      sleep_end: iso(b.sleep_end),
      logged_at: b.logged_at,
    };
    const alasan: string[] = [];
    let mulai = sebelum.sleep_start;
    let selesai = sebelum.sleep_end;

    const disimpan = new Date(b.created_at).getTime();
    if (new Date(selesai).getTime() > disimpan + KELONGGARAN_MS) {
      const mulaiMundur = geser(mulai, -SEHARI_MS);
      const selesaiMundur = geser(selesai, -SEHARI_MS);

      if (new Date(selesaiMundur).getTime() <= disimpan + KELONGGARAN_MS) {
        mulai = mulaiMundur;
        selesai = selesaiMundur;
        alasan.push('jam bangun belum terjadi saat disimpan, mundur sehari');
      } else {
        dibiarkan.push(`${rentang(sebelum)}  disimpan ${wib.format(new Date(disimpan))}`);
      }
    }

    const tanggal = sleepDay(mulai);
    if (tanggal !== b.logged_at) alasan.push(`tanggal tidur ${b.logged_at} jadi ${tanggal}`);

    const sesudah: Waktu = { sleep_start: mulai, sleep_end: selesai, logged_at: tanggal };
    sesudahSemua.push({ ...sesudah, id: b.id, user_id: b.user_id });

    if (alasan.length > 0)
      perubahan.push({ id: b.id, user_id: b.user_id, alasan, sebelum, sesudah });
  }

  log(`Perubahan: ${perubahan.length}`);
  for (const p of perubahan) {
    log(`  ${rentang(p.sebelum)}`);
    log(`    jadi ${rentang(p.sesudah)}`);
    log(`    karena ${p.alasan.join('; ')}`);
  }

  if (dibiarkan.length > 0) {
    log(`\nDibiarkan, sesudah digeser pun masih di masa depan (cek manual):`);
    for (const d of dibiarkan) log(`  ${d}`);
  }

  const tabrakan = cariTabrakan(sesudahSemua);
  if (tabrakan.length > 0) {
    log(`\nSesudah rencana masih ada tabrakan, rencana TIDAK disimpan:`);
    for (const t of tabrakan) log(`  ${t}`);
    process.exitCode = 1;
    return;
  }

  const rencana: Rencana = { dibuat: new Date().toISOString(), cadangan, perubahan };
  writeFileSync(berkasRencana, JSON.stringify(rencana, null, 2));
  log(`\nTidak ada tabrakan sesudahnya. Rencana: ${berkasRencana}`);
};

const terapkan = async (): Promise<void> => {
  if (!existsSync(berkasRencana)) throw new Error(`Rencana belum ada, jalankan uji dulu`);
  const rencana = JSON.parse(readFileSync(berkasRencana, 'utf8')) as Rencana;
  const sekarang = new Map((await bacaSemua()).map((b) => [b.id, b]));

  let ditulis = 0;
  for (const p of rencana.perubahan) {
    const b = sekarang.get(p.id);
    const sama =
      b !== undefined &&
      iso(b.sleep_start) === p.sebelum.sleep_start &&
      iso(b.sleep_end) === p.sebelum.sleep_end &&
      b.logged_at === p.sebelum.logged_at;

    if (!sama) {
      log(`Dilewati, berubah sejak uji: ${rentang(p.sebelum)}`);
      continue;
    }

    await directus.request(
      updateItem('sleep_logs', p.id, {
        sleep_start: p.sesudah.sleep_start,
        sleep_end: p.sesudah.sleep_end,
        logged_at: p.sesudah.logged_at,
      } as never),
    );
    ditulis += 1;
    log(`Ditulis: ${rentang(p.sesudah)}`);
  }

  log(`\n${ditulis} dari ${rencana.perubahan.length} perubahan ditulis`);
};

const kembalikan = async (): Promise<void> => {
  const rencana = JSON.parse(readFileSync(berkasRencana, 'utf8')) as Rencana;

  let gagal = 0;
  for (const p of rencana.perubahan) {
    try {
      await directus.request(updateItem('sleep_logs', p.id, { ...p.sebelum } as never));
    } catch {
      // Sesi yang sudah dihapus user sejak migrasi tidak perlu dipulihkan.
      gagal += 1;
    }
  }
  log(
    `Dipulihkan ${rencana.perubahan.length - gagal} sesi dari rencana, ${gagal} sudah tidak ada. Cadangan lengkap: ${rencana.cadangan}`,
  );
};

const main = async (): Promise<void> => {
  const tahap = process.argv[2];
  if (tahap === 'uji') await uji();
  else if (tahap === 'terapkan') await terapkan();
  else if (tahap === 'kembalikan') await kembalikan();
  else throw new Error('Sebutkan tahapnya: uji, terapkan, atau kembalikan');
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
