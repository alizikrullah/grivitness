/**
 * Isi ulang gula untuk catatan makan dari sebelum fitur gula (rilis 1.2.0).
 *
 * Jalankan:
 *   npx tsx scripts/isi-gula.ts uji [folder]         cadangkan, taksir, simpan rencana. TIDAK menulis.
 *   npx tsx scripts/isi-gula.ts terapkan [folder]    tulis rencana hasil uji, persis.
 *   npx tsx scripts/isi-gula.ts kembalikan [folder]  pulihkan ai_analysis dan sugar_g dari cadangan.
 *
 * Folder bawaan ../../grivitness-cadangan, di LUAR repo: cadangan berisi
 * catatan makan pemiliknya dan tidak boleh ikut ter-commit.
 *
 * Aturannya:
 *   - Satu taksiran per nama makanan (dinormalisasi, plus satuan), supaya
 *     "Teh pucuk" yang dicatat sepuluh kali dapat rasio gula yang sama.
 *   - Yang ditanyakan ke model profil per 100: kkal, karbo, gula. Gula item
 *     diturunkan sebagai RASIO gula per karbo dikali karbo yang tersimpan,
 *     jadi tidak pernah melebihi karbo yang selama ini dilihat user.
 *   - Item kemasan memakai gulaDariRasio(), aturan yang sama dengan kode hidup.
 *   - Ditandai sugar_source BACKFILL. Kalori, makro, dan berat TIDAK disentuh.
 *   - terapkan menolak menulis catatan yang berubah sejak uji (diedit user di
 *     antaranya); jalankan uji lagi untuk catatan itu.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readItems, updateItem } from '@directus/sdk';

import { directus } from '../src/config/directus.js';
import { kunciIngatan } from '../src/modules/food/food-memory.js';
import {
  type FoodAnalysis,
  type FoodItem,
  gulaDariRasio,
  jumlahkan,
  per100Dari,
  type Per100,
} from '../src/utils/food-math.js';
import { analyzeText } from '../src/utils/groq.js';

const log = (pesan: string): void => {
  process.stdout.write(`${pesan}\n`);
};

const folder = resolve(process.argv[3] ?? '../../grivitness-cadangan');
const berkasRencana = resolve(folder, 'rencana-isi-gula.json');

interface BarisMakan {
  id: string;
  logged_at: string;
  ai_analysis: Record<string, unknown> | null;
  sugar_g: string | null;
}

interface Rencana {
  dibuat: string;
  cadangan: string;
  profil: Record<string, { nama: string; unit: string; per100: Per100 }>;
  catatan: {
    id: string;
    hash: string;
    items: { index: number; sugar_per_100: number; sugar_g: number }[];
  }[];
}

const hashAnalisa = (a: unknown): string =>
  createHash('sha256').update(JSON.stringify(a)).digest('hex');

const bulat1 = (n: number): number => Math.round(n * 10) / 10;

/** Item yang gulanya belum diketahui dan gizinya tidak hilang. */
const perluGula = (item: FoodItem): boolean =>
  !item.nutrition_missing && (item.sugar_source === undefined || item.sugar_source === null);

const analisaDari = (b: BarisMakan): FoodAnalysis | null => {
  const a = b.ai_analysis as Partial<FoodAnalysis> | null;
  return a && Array.isArray(a.items) ? (a as FoodAnalysis) : null;
};

const bacaSemua = async (): Promise<BarisMakan[]> =>
  await directus.request(
    readItems('food_logs', {
      fields: ['id', 'logged_at', 'ai_analysis', 'sugar_g'],
      sort: ['logged_at'],
      limit: -1,
    }),
  );

const jeda = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Satu nama makanan yang perlu ditaksir gulanya, beserta gizi yang SUDAH
 * tersimpan untuknya. Profil itu ikut dikirim ke model: ditanya nama saja,
 * model mengira "Teh pucuk harum" teh tawar dan menjawab nol gula, padahal
 * catatan aslinya mencatat 36 g karbo. Dengan profilnya, model menaksir gula
 * untuk makanan yang sama persis dengan yang dulu dihitung.
 */
interface NamaMakanan {
  kunci: string;
  nama: string;
  unit: string;
  konteks: string;
}

const konteksItem = (item: FoodItem): string => {
  const satuan = item.unit === 'ml' ? 'ml' : 'g';
  if (item.label) {
    const l = item.label;
    const makro = [
      l.carbs_g ? `carbs ${l.carbs_g} g` : '',
      l.protein_g ? `protein ${l.protein_g} g` : '',
      l.fat_g ? `fat ${l.fat_g} g` : '',
    ].filter(Boolean);
    return `package label per portion: ${l.kcal} kcal${makro.length ? ', ' + makro.join(', ') : ''}`;
  }
  return `recorded per 100 ${satuan}: ${item.kcal_per_100} kcal, carbs ${item.carbs_per_100} g, protein ${item.protein_per_100} g, fat ${item.fat_per_100} g`;
};

/** Satu permintaan ke model teks untuk sekelompok nama. */
const tanyaKelompok = async (kelompok: NamaMakanan[]): Promise<Map<string, Per100>> => {
  const baris = kelompok
    .map((d, i) => `${i + 1}. ${d.nama}, unit ${d.unit === 'ml' ? 'ml' : 'g'} (${d.konteks})`)
    .join('\n');

  const prompt = `These foods and drinks were logged by an Indonesian user, with the nutrition already recorded for each. Indonesian bottled teas and packaged drinks are usually sweetened. For EACH numbered item give its nutrition per 100 g (or per 100 ml when the unit is ml) AS EATEN, consistent with the recorded numbers:
- kcal_per_100
- carbs_per_100: total carbohydrates
- sugar_per_100: total sugars as on a nutrition label (natural plus added), the part of carbs_per_100 that is sugar, never more than carbs_per_100

Sugar is usually a SMALL part of carbohydrates in savory and starchy food, and most of it in sweet food and sweetened drinks. Reference values per 100 g or ml (carbs / sugar): cooked white rice 28 / 0.1, cooked instant noodles with seasoning 25 / 1.5, white bread 49 / 5, fried tofu or tempeh 9 / 1, fried chicken 8 / 0.5, cassava snack 30 / 2, chocolate biscuits 65 / 25, sweet cake 45 / 25, sweetened bottled tea 7 / 7, sweetened fruit drink 12 / 11, black coffee 0 / 0. Do not copy carbs into sugar.

${baris}

Return ONLY a JSON object: {"items":[{"index":number,"kcal_per_100":number,"carbs_per_100":number,"sugar_per_100":number}]}
One entry per numbered item, with the matching index. Never rename, merge, or drop items.`;

  const raw = await analyzeText(prompt);
  const isi = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];

  return new Map(
    kelompok.map((d, i) => [
      d.kunci,
      per100Dari(isi.find((e) => Number(e.index) === i + 1) ?? isi[i]),
    ]),
  );
};

/**
 * Profil per 100 untuk sekumpulan nama, dari model teks, per kelompok kecil.
 * Kelompok yang gagal dibaca dicoba sekali lagi, lalu dipecah dua sampai
 * tinggal satu nama: satu nama aneh tidak boleh menggagalkan semuanya.
 */
const taksirProfil = async (daftar: NamaMakanan[]): Promise<Map<string, Per100>> => {
  const hasil = new Map<string, Per100>();
  const antre: NamaMakanan[][] = [];
  for (let i = 0; i < daftar.length; i += 8) antre.push(daftar.slice(i, i + 8));

  let ke = 0;
  while (antre.length > 0) {
    const kelompok = antre.shift();
    if (!kelompok || kelompok.length === 0) continue;
    ke += 1;
    log(`   model: kelompok ${ke}, ${kelompok.length} nama`);

    let jawaban: Map<string, Per100> | null = null;
    for (let coba = 0; coba < 2 && jawaban === null; coba++) {
      try {
        jawaban = await tanyaKelompok(kelompok);
      } catch (error) {
        log(
          `   ! gagal (${error instanceof Error ? error.message : String(error)}), tunggu lalu ulang`,
        );
        await jeda(20_000);
      }
    }

    if (jawaban) {
      for (const [k, v] of jawaban) hasil.set(k, v);
    } else if (kelompok.length > 1) {
      const tengah = Math.ceil(kelompok.length / 2);
      antre.unshift(kelompok.slice(0, tengah), kelompok.slice(tengah));
    } else {
      log(`   ! ${kelompok[0]?.nama ?? '?'} dilewati, gulanya dibiarkan kosong`);
    }

    // Jeda supaya tidak menabrak batas token per menit free tier.
    if (antre.length > 0) await jeda(10_000);
  }

  return hasil;
};

/** Gula satu item dari profil namanya. Null kalau profilnya tidak terbaca. */
const gulaItem = (item: FoodItem, p: Per100): { sugar_per_100: number; sugar_g: number } | null => {
  if (p.missing || p.sugar === null) return null;

  if (item.label) {
    const perPorsi = gulaDariRasio(item.label, p);
    if (perPorsi === null) return null;
    return {
      sugar_per_100:
        item.weight_per_portion > 0 ? bulat1((perPorsi * 100) / item.weight_per_portion) : 0,
      sugar_g: bulat1(perPorsi * item.portions),
    };
  }

  // Model bilang tanpa karbo padahal catatan aslinya berkarbo: dua tafsiran
  // makanan yang berbeda. Lebih baik dibiarkan tidak diketahui daripada nol
  // yang meyakinkan.
  if (p.carbs === 0 && item.carbs_per_100 > 1) return null;

  // Rasio gula per karbo dikali karbo yang TERSIMPAN, supaya gula tidak
  // pernah melebihi karbo yang selama ini dilihat user.
  const per100 =
    p.carbs > 0
      ? item.carbs_per_100 * Math.min(1, p.sugar / p.carbs)
      : Math.min(p.sugar, item.carbs_per_100);
  return {
    sugar_per_100: bulat1(per100),
    sugar_g: bulat1((item.amount * per100) / 100),
  };
};

// ============================================================

const uji = async (): Promise<void> => {
  mkdirSync(folder, { recursive: true });
  const semua = await bacaSemua();

  const cadangan = resolve(
    folder,
    `food_logs-sebelum-isi-gula-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  writeFileSync(cadangan, JSON.stringify(semua, null, 2));
  log(`Cadangan ${semua.length} catatan makan: ${cadangan}`);

  const nama = new Map<string, NamaMakanan>();
  for (const b of semua) {
    for (const item of analisaDari(b)?.items ?? []) {
      if (!perluGula(item)) continue;
      const kunci = kunciIngatan(item.name, item.unit);
      if (!nama.has(kunci)) {
        nama.set(kunci, { kunci, nama: item.name, unit: item.unit, konteks: konteksItem(item) });
      }
    }
  }
  log(`${nama.size} nama makanan perlu taksiran gula\n`);

  const profil = await taksirProfil([...nama.values()]);

  const rencana: Rencana = { dibuat: new Date().toISOString(), cadangan, profil: {}, catatan: [] };
  for (const [kunci, d] of nama) {
    const p = profil.get(kunci);
    if (p) rencana.profil[kunci] = { nama: d.nama, unit: d.unit, per100: p };
  }

  const ringkas = new Map<string, { kali: number; contoh: number; karbo: number }>();
  let melanggar = 0;
  let tanpaProfil = 0;

  for (const b of semua) {
    const a = analisaDari(b);
    if (!a) continue;

    const items: Rencana['catatan'][number]['items'] = [];
    a.items.forEach((item, index) => {
      if (!perluGula(item)) return;
      const kunci = kunciIngatan(item.name, item.unit);
      const p = profil.get(kunci);
      const g = p ? gulaItem(item, p) : null;
      if (!g) {
        tanpaProfil += 1;
        return;
      }
      if (g.sugar_g > item.carbs_g + 0.1) melanggar += 1;
      items.push({ index, ...g });

      const r = ringkas.get(kunci) ?? { kali: 0, contoh: g.sugar_g, karbo: item.carbs_g };
      r.kali += 1;
      ringkas.set(kunci, r);
    });

    if (items.length > 0)
      rencana.catatan.push({ id: b.id, hash: hashAnalisa(b.ai_analysis), items });
  }

  log(
    '\nNama | satuan | gula/100 model | karbo/100 model | dicatat | contoh gula item (karbo item)',
  );
  for (const [kunci, r] of [...ringkas.entries()].sort((x, y) => y[1].contoh - x[1].contoh)) {
    const p = rencana.profil[kunci];
    if (!p) continue;
    log(
      `${p.nama} | ${p.unit} | ${String(p.per100.sugar)} | ${p.per100.carbs} | ${r.kali}x | ${r.contoh} g (${r.karbo} g)`,
    );
  }

  writeFileSync(berkasRencana, JSON.stringify(rencana, null, 2));
  const jumlahItem = rencana.catatan.reduce((t, c) => t + c.items.length, 0);
  log(`\nRencana: ${rencana.catatan.length} catatan, ${jumlahItem} item. ${berkasRencana}`);
  log(`Gula melebihi karbo: ${melanggar}. Item tanpa profil (dibiarkan kosong): ${tanpaProfil}.`);
  log('BELUM ada yang ditulis. Jalankan "terapkan" untuk menulis rencana ini.');
};

const terapkan = async (): Promise<void> => {
  if (!existsSync(berkasRencana)) throw new Error('Rencana belum ada, jalankan "uji" dulu');
  const rencana = JSON.parse(readFileSync(berkasRencana, 'utf8')) as Rencana;

  const sekarang = new Map((await bacaSemua()).map((b) => [b.id, b]));
  let ditulis = 0;
  let berubah = 0;

  for (const c of rencana.catatan) {
    const b = sekarang.get(c.id);
    if (!b || hashAnalisa(b.ai_analysis) !== c.hash) {
      berubah += 1;
      continue;
    }
    const a = analisaDari(b);
    if (!a) continue;

    const items = a.items.map((item, index) => {
      const g = c.items.find((x) => x.index === index);
      return g ? { ...item, ...g, sugar_source: 'BACKFILL' as const } : item;
    });

    // Kalori dan makro TIDAK dihitung ulang: cuma gula yang ditambahkan.
    const gula = jumlahkan(items).sugar_g;
    await directus.request(
      updateItem('food_logs', c.id, {
        ai_analysis: { ...a, items, sugar_g: gula },
        sugar_g: gula.toFixed(2),
      }),
    );
    ditulis += 1;
  }

  log(`Ditulis ${ditulis} catatan. Dilewati karena berubah sejak uji: ${berubah}.`);
};

const kembalikan = async (): Promise<void> => {
  const rencana = JSON.parse(readFileSync(berkasRencana, 'utf8')) as Rencana;
  const cadangan = JSON.parse(readFileSync(rencana.cadangan, 'utf8')) as BarisMakan[];

  let gagal = 0;
  for (const b of cadangan) {
    try {
      await directus.request(
        updateItem('food_logs', b.id, { ai_analysis: b.ai_analysis, sugar_g: b.sugar_g } as never),
      );
    } catch {
      // Catatan yang sudah dihapus user sejak cadangan dibuat tidak perlu dipulihkan.
      gagal += 1;
    }
  }
  log(
    `Dipulihkan ${cadangan.length - gagal} catatan dari ${rencana.cadangan}, ${gagal} sudah tidak ada`,
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
