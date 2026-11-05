import type { FoodUnit } from '../../constants/enums.js';
import {
  balasanPerItem,
  type FoodEstimate,
  type FoodItemInput,
  kebutuhanModel,
  type Per100,
  per100Dari,
} from '../../utils/food-math.js';
import {
  catatanMirip,
  type FoodMemory,
  type FoodSuggestion,
  keSaran,
  kunciIngatan,
} from './food-memory.js';

/**
 * Foto makanan jadi isian form, bukan langsung catatan.
 *
 * Murni tanpa Directus dan tanpa Groq, diuji di food-scan.test.ts, sama seperti
 * workout-scan.ts. Tidak ada yang tersimpan dari sini: hasilnya mengisi form,
 * user memeriksa, lalu menekan Simpan lewat POST /api/food biasa.
 *
 * Inilah yang membuat model boleh menebak nama dan porsi di sini, padahal di
 * jalur simpan dilarang. Larangan itu lahir karena tebakan yang salah ("2 pcs"
 * dihitung 1) langsung tersimpan tanpa ada yang memeriksa. Sekarang tebakannya
 * cuma draf, dan yang menyimpan user.
 */

export interface FoodScanItem {
  name: string;
  portions: number;
  unit: FoodUnit;
  /** Berat satu porsi dari foto. Null kalau user sudah mengisinya, atau model diam. */
  weight: number | null;
  /** Dikirim balik saat Simpan supaya model tidak dipanggil dua kali. Null kalau model diam. */
  estimate: FoodEstimate | null;
  /** Nama dan porsinya tebakan model, bukan tulisan user. */
  guessed: boolean;
  /** Catatan bernama dan bersatuan PERSIS sama. Otomatis dipakai, bertanda di form. */
  memory: FoodSuggestion | null;
  /** Catatan yang cuma mirip. Harus diklik: Nasi Goreng Teri bukan Nasi Goreng. */
  similar: FoodSuggestion[];
}

export interface FoodScanResult {
  items: FoodScanItem[];
  confidence: string | null;
  /** Null kalau model tidak dipanggil karena semua baris sudah tertutup. */
  photo_matches: boolean | null;
  photo_note: string | null;
}

/**
 * Prompt untuk form kosong: model menyebut apa yang terlihat.
 *
 * Nama catatan dikirim supaya makanan yang sama dieja sama, bukan supaya model
 * memilih yang terdekat. Yang menyambungkan ke catatan tetap kode, lewat nama
 * yang persis sama, jadi varian seperti nasi goreng teri harus ditulis lengkap.
 */
export const foodScanPrompt = (namaCatatan: string[]): string => {
  const daftar = namaCatatan.length > 0 ? namaCatatan.map((n) => `- ${n}`).join('\n') : '(none)';

  return `A photo of a meal is attached. List every distinct food and drink you can see, so the person can review the list before saving it.

Food names this person has logged before:
${daftar}

For each food return:
- name: a short Indonesian name, as Indonesians call it. If the food is exactly one of the names above, copy that name letter by letter. If it is a variant with a different main ingredient or topping, write the full variant name and do NOT use the plainer name: fried rice with anchovies is "Nasi Goreng Teri", not "Nasi Goreng". Write what you see, do not force a match.
- portions: how many identical pieces or servings are visible. A plate of rice is 1, three pieces of tempe are 3.
- unit: "ml" for drinks, "g" for everything else.
- grams_per_portion: the weight of ONE portion in that unit, using the plate, cutlery, and bowls as scale references.
- kcal_per_100, protein_per_100, carbs_per_100, fat_per_100, sugar_per_100: nutrition per 100 g (or per 100 ml when the unit is ml) of the food AS EATEN, from standard food composition tables. Fried food must include absorbed oil; cooked rice is not dry rice. sugar_per_100 is total sugars as on a nutrition label and can never exceed carbs_per_100.

Return ONLY a JSON object with this exact structure:
{
  "items": [
    {
      "name": "string",
      "portions": number,
      "unit": "g" | "ml",
      "grams_per_portion": number,
      "kcal_per_100": number,
      "protein_per_100": number,
      "carbs_per_100": number,
      "fat_per_100": number,
      "sugar_per_100": number
    }
  ],
  "confidence": "low" | "medium" | "high"
}

Rules:
- Do NOT multiply by the portion count and do NOT return totals. The application computes every total.
- One entry per food. Rice and the chicken on it are two entries.
- If the photo shows no food or drink, return an empty items array.`;
};

const MAKS_ITEM = 20;
const MAKS_NAMA = 120;
const MAKS_PORSI = 50;
const MAKS_BERAT = 5000;

const angka = (nilai: unknown, min: number, max: number): number | null => {
  const n = typeof nilai === 'string' ? Number(nilai.replace(',', '.')) : nilai;
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

/** Dibulatkan: berat ini dibandingkan lagi saat Simpan untuk tahu user mengubahnya atau tidak. */
const beratDariModel = (nilai: unknown): number | null => {
  const n = angka(nilai, 1, MAKS_BERAT);
  return n === null ? null : Math.round(n);
};

const keTaksiran = (berat: number | null, p: Per100): FoodEstimate | null =>
  p.missing
    ? null
    : {
        ...(berat === null ? {} : { grams_per_portion: berat }),
        kcal_per_100: p.kcal,
        protein_per_100: p.protein,
        carbs_per_100: p.carbs,
        fat_per_100: p.fat,
        sugar_per_100: p.sugar,
      };

const keyakinan = (raw: Record<string, unknown>): string | null =>
  typeof raw.confidence === 'string' ? raw.confidence : null;

/**
 * Form kosong: daftar dari model dirapikan, lalu dicocokkan ke catatan.
 *
 * Nama yang persis sama (dinormalisasi, satuan sama) memakai ejaan catatan dan
 * langsung tersambung. Yang cuma mirip dilampirkan sebagai saran.
 */
export const hasilTebakan = (
  raw: Record<string, unknown>,
  peta: Map<string, FoodMemory>,
): FoodScanResult => {
  const daftar = Array.isArray(raw.items) ? (raw.items as unknown[]) : [];

  const items = daftar.slice(0, MAKS_ITEM).flatMap((entri): FoodScanItem[] => {
    if (typeof entri !== 'object' || entri === null || Array.isArray(entri)) return [];
    const r = entri as Record<string, unknown>;

    const nama = typeof r.name === 'string' ? r.name.trim().slice(0, MAKS_NAMA) : '';
    if (nama === '') return [];

    const unit: FoodUnit = r.unit === 'ml' ? 'ml' : 'g';
    const berat = beratDariModel(r.grams_per_portion);
    const cocok = peta.get(kunciIngatan(nama, unit)) ?? null;

    return [
      {
        name: cocok?.name ?? nama,
        portions: angka(r.portions, 0.01, MAKS_PORSI) ?? 1,
        unit,
        weight: berat,
        estimate: keTaksiran(berat, per100Dari(r)),
        guessed: true,
        memory: cocok ? keSaran(cocok) : null,
        similar: cocok ? [] : catatanMirip(peta, nama, unit).map(keSaran),
      },
    ];
  });

  return { items, confidence: keyakinan(raw), photo_matches: true, photo_note: null };
};

/**
 * Baris yang sudah ditulis user: nama dan porsinya tidak disentuh, model cuma
 * menjawab yang masih kosong. Hasilnya satu banding satu dengan masukan.
 */
export const hasilTertulis = (
  items: FoodItemInput[],
  ingatan: (FoodMemory | null)[],
  raw: Record<string, unknown>,
): FoodScanResult => {
  const balasan = balasanPerItem(raw, items.length);
  // Semua baris tertutup kemasan atau catatan: tidak ada yang melihat fotonya.
  const dipanggil = Object.keys(raw).length > 0;

  return {
    items: items.map((item, i) => {
      const butuh = kebutuhanModel(item, ingatan[i] ?? null, true);
      const model = balasan[i];
      const berat = butuh.berat ? (model?.berat ?? null) : null;

      return {
        name: item.name,
        portions: item.portions,
        unit: item.unit,
        weight: berat === null ? null : Math.round(berat),
        estimate: butuh.gizi && model ? keTaksiran(berat, model.per100) : null,
        guessed: false,
        memory: null,
        similar: [],
      };
    }),
    confidence: keyakinan(raw),
    photo_matches: !dipanggil
      ? null
      : typeof raw.photo_matches === 'boolean'
        ? raw.photo_matches
        : true,
    photo_note:
      raw.photo_matches === false && typeof raw.photo_note === 'string' && raw.photo_note.trim()
        ? raw.photo_note.trim()
        : null,
  };
};
