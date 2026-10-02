import { forUser } from '../../data/scoped.js';
import type { FoodLogRecord } from '../../types/directus-schema.js';
import type { FoodUnit } from '../../constants/enums.js';
import type {
  FoodAnalysis,
  FoodItem,
  FoodItemInput,
  IngatanItem,
  Per100,
} from '../../utils/food-math.js';

/**
 * Ingatan makanan: nilai gizi yang pernah dipakai user untuk nama yang sama.
 *
 * Tiap catatan makan sudah menyimpan nilai per 100 g/ml tiap itemnya. Yang
 * dulu tidak pernah terjadi: dipakai ulang. Setiap kali user mencatat, model
 * ditanya dari nol, dan dua model (vision untuk foto, teks tanpa foto) punya
 * tabel gizi yang berbeda di bobotnya. Americano yang sama dapat 21 kkal hari
 * ini dan 7 kkal besok. Bias yang konsisten masih bisa dikalibrasi
 * observeTDEE dari timbangan; goyangan acak seperti itu tidak.
 *
 * Ingatan HANYA dipakai untuk item yang user pilih dari saran (from_memory).
 * Nama yang diketik sama persis tetap ditaksir dari nol: klik berarti "sama
 * seperti kemarin", ketik berarti "taksir dari awal", dan foto yang
 * dilampirkan saat mengetik kembali berguna. Server tetap mencocokkan ulang
 * nama dan satuannya; tanda klik untuk nama yang tidak ada di ingatan jatuh
 * ke model, bukan error.
 *
 * Prioritasnya: angka kemasan (dibaca user, bukan taksiran) menang atas item
 * yang pernah dikoreksi user, yang menang atas taksiran AI terakhir. Di
 * antara yang setingkat, yang paling baru dipakai. Kecocokan lewat nama yang
 * dinormalisasi DAN satuan yang sama: "susu" per 100 ml dan "susu bubuk" per
 * 100 g bukan hal yang sama.
 *
 * Nama yang dilupakan user (tekan lama chip saran) mengabaikan semua catatan
 * yang DIBUAT sebelum waktu itu. Catatan sesudahnya membangun ingatan dari
 * nol, jadi angka yang salah tidak bisa hidup lagi lewat salinannya.
 */
export interface FoodMemory extends IngatanItem {
  /** Nama persis seperti terakhir ditulis user, untuk ditampilkan di saran. */
  name: string;
  key: string;
  unit: FoodUnit;
  /** Asal angkanya semula: kemasan, koreksi user, atau taksiran AI. */
  origin: 'LABEL' | 'EDITED' | 'AI';
  /** Berapa kali nama ini pernah dicatat. Menentukan urutan saran. */
  times: number;
  last_logged_at: string;
  /**
   * Peringkat internal saat menyusun peta. Salinan (nutrition_source PREVIOUS)
   * selalu di bawah sumbernya, supaya nama yang diketik sembarangan saat
   * memakai ulang tidak menggeser nama asli di saran, dan angkanya tetap
   * mengalir dari catatan yang benar-benar pertama.
   */
  peringkat: number;
}

const PERINGKAT: Record<FoodMemory['origin'], number> = { LABEL: 2, EDITED: 1, AI: 0 };
const PERINGKAT_SALINAN = -1;

/** Berapa catatan terakhir yang dibaca. Cukup untuk berbulan-bulan kebiasaan makan. */
const MAKS_CATATAN = 400;

/**
 * Huruf kecil, tanda baca dibuang, spasi dirapikan. "Nescafe Classic bubuk"
 * dan "nescafe classic  bubuk." adalah nama yang sama.
 */
export const normalisasiNama = (nama: string): string =>
  nama
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const kunciIngatan = (nama: string, unit: FoodUnit): string =>
  `${normalisasiNama(nama)}|${unit}`;

const asalItem = (item: FoodItem, analisa: FoodAnalysis): FoodMemory['origin'] => {
  if (item.label) return 'LABEL';
  if (analisa.user_edited) return 'EDITED';
  return 'AI';
};

/**
 * Gula tersimpan satu item, atau null kalau tidak diketahui. Catatan dari
 * sebelum fitur gula belum punya kolomnya sama sekali sampai diisi ulang.
 */
const gulaDiketahui = (item: FoodItem): boolean =>
  typeof item.sugar_source === 'string' && typeof item.sugar_g === 'number';

/** Gizi yang dipakai ulang dari satu item tersimpan: ingatan, atau item itu sendiri saat koreksi. */
export const giziTersimpan = (item: FoodItem): IngatanItem => {
  const gula = gulaDiketahui(item);
  const per100: Per100 = {
    kcal: item.kcal_per_100,
    protein: item.protein_per_100,
    carbs: item.carbs_per_100,
    fat: item.fat_per_100,
    sugar: gula ? item.sugar_per_100 : null,
    missing: item.nutrition_missing,
  };

  return {
    weight_per_portion: item.weight_per_portion > 0 ? item.weight_per_portion : null,
    label: item.label ?? null,
    per100,
    sugar_per_portion:
      gula && item.label && item.portions > 0
        ? Math.round((item.sugar_g / item.portions) * 10) / 10
        : null,
  };
};

type CatatanIngatan = Pick<FoodLogRecord, 'ai_analysis' | 'logged_at' | 'created_at'>;

/**
 * Menyusun peta ingatan dari catatan-catatan user. Murni setelah datanya
 * ada, jadi bagian ini bisa diuji dengan catatan buatan.
 *
 * @param lupa kunci ingatan -> waktu dilupakan. Item dari catatan yang dibuat
 *             pada atau sebelum waktu itu dilewati.
 */
export const susunIngatan = (logs: CatatanIngatan[], lupa: Map<string, string> = new Map()) => {
  const peta = new Map<string, FoodMemory>();

  // Diasumsikan urut dari yang terbaru, jadi yang pertama terlihat pada
  // peringkat yang sama adalah yang paling baru.
  for (const log of logs) {
    const a = log.ai_analysis as Partial<FoodAnalysis> | null;
    if (!a || !Array.isArray(a.items)) continue;
    const analisa = a as FoodAnalysis;

    for (const item of analisa.items) {
      if (typeof item.name !== 'string' || (item.unit !== 'g' && item.unit !== 'ml')) continue;
      // Item yang gizinya hilang tidak diingat: itu justru yang salah.
      if (item.nutrition_missing) continue;

      const key = kunciIngatan(item.name, item.unit);

      // Catatan yang dibuat sebelum nama ini dilupakan tidak dihitung lagi.
      // Tanpa waktu dibuat, catatannya dianggap lama.
      const dilupakan = lupa.get(key);
      if (
        dilupakan !== undefined &&
        (log.created_at === null ||
          new Date(log.created_at).getTime() <= new Date(dilupakan).getTime())
      ) {
        continue;
      }

      const origin = asalItem(item, analisa);
      const peringkat =
        item.nutrition_source === 'PREVIOUS' ? PERINGKAT_SALINAN : PERINGKAT[origin];
      const ada = peta.get(key);

      if (ada) {
        ada.times += 1;
        if (peringkat <= ada.peringkat) continue;
      }

      peta.set(key, {
        ...giziTersimpan(item),
        name: item.name,
        key,
        unit: item.unit,
        origin,
        times: ada ? ada.times : 1,
        last_logged_at: ada ? ada.last_logged_at : log.logged_at,
        peringkat,
      });
    }
  }

  return peta;
};

/** Waktu dilupakan per kunci ingatan. */
const bacaLupa = async (userId: string): Promise<Map<string, string>> => {
  const baris = await forUser(userId).list('food_memory_forgets', {
    fields: ['memory_key', 'forgotten_at'],
    limit: -1,
  });
  return new Map(baris.map((b) => [b.memory_key, b.forgotten_at]));
};

export const bacaIngatan = async (userId: string): Promise<Map<string, FoodMemory>> => {
  const [logs, lupa] = await Promise.all([
    forUser(userId).list('food_logs', {
      fields: ['ai_analysis', 'logged_at', 'created_at'],
      sort: ['-logged_at'],
      limit: MAKS_CATATAN,
    }),
    bacaLupa(userId),
  ]);
  return susunIngatan(logs, lupa);
};

/**
 * Ingatan untuk tiap item masukan. HANYA item yang ditandai from_memory yang
 * dicocokkan; sisanya null dan ditaksir dari nol.
 */
export const cocokkanIngatan = (
  peta: Map<string, FoodMemory>,
  items: FoodItemInput[],
): (FoodMemory | null)[] =>
  items.map((i) => (i.from_memory ? (peta.get(kunciIngatan(i.name, i.unit)) ?? null) : null));

/** Batas saran yang dikirim ke layar. */
const MAKS_SARAN = 8;

/**
 * Saran nama untuk form makanan. Kosong berarti "yang paling sering", jadi
 * form yang baru dibuka langsung menawarkan kebiasaan user.
 */
export const saranMakanan = (peta: Map<string, FoodMemory>, cari: string): FoodMemory[] => {
  const q = normalisasiNama(cari);

  return [...peta.values()]
    .filter((m) => q === '' || normalisasiNama(m.name).includes(q))
    .sort((a, b) => {
      // Yang namanya DIAWALI kata pencarian naik ke atas, lalu yang paling
      // sering dicatat, lalu yang paling baru.
      const awalA = q !== '' && normalisasiNama(a.name).startsWith(q) ? 1 : 0;
      const awalB = q !== '' && normalisasiNama(b.name).startsWith(q) ? 1 : 0;
      if (awalA !== awalB) return awalB - awalA;
      if (a.times !== b.times) return b.times - a.times;
      return a.last_logged_at < b.last_logged_at ? 1 : -1;
    })
    .slice(0, MAKS_SARAN);
};

/**
 * Kalori satu porsi seperti yang akan dihitung kalau saran ini dipilih apa
 * adanya. Ditampilkan di chip, supaya user tahu angka mana yang dia pilih
 * sebelum memilihnya. Null kalau beratnya tidak tersimpan.
 */
export const kaloriPerPorsi = (m: IngatanItem): number | null => {
  if (m.label) return Math.round(m.label.kcal);
  if (m.weight_per_portion === null) return null;
  return Math.round((m.weight_per_portion * m.per100.kcal) / 100);
};
