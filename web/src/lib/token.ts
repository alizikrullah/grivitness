/**
 * Penyimpanan token di browser.
 *
 * PERBEDAAN PENTING DARI MOBILE, dan ini kompromi yang sadar.
 *
 * Mobile memakai expo-secure-store yang menaruh token di Keychain/Keystore, * terenkripsi dan tidak terbaca oleh proses lain. Browser tidak punya padanan
 * itu. Yang tersedia cuma localStorage/sessionStorage, dan keduanya bisa dibaca
 * oleh JavaScript mana pun yang berhasil berjalan di halaman ini. Artinya satu
 * celah XSS sudah cukup untuk mencuri sesi.
 *
 * Yang benar-benar aman adalah menaruh refresh token di cookie httpOnly, karena
 * cookie seperti itu tidak bisa disentuh JavaScript sama sekali. Tapi itu
 * menuntut backend ikut berubah: mengirim Set-Cookie, menyalakan CORS dengan
 * credentials, dan menambah perlindungan CSRF, yang tanpa itu justru membuka
 * lubang baru.
 *
 * Untuk sekarang dipakai localStorage, dan keputusannya ditulis di sini supaya
 * tidak terlihat seperti kelalaian. Naik ke cookie httpOnly adalah langkah
 * berikutnya kalau aplikasi ini dipakai lebih dari satu orang.
 *
 * sessionStorage sempat dipertimbangkan dan ditolak: tokennya hilang setiap tab
 * ditutup, jadi user harus masuk ulang terus-menerus, sementara terhadap XSS
 * dia sama rentannya.
 */

const ACCESS_KEY = 'grivitness.access_token';
const REFRESH_KEY = 'grivitness.refresh_token';

export interface TokenPair {
  access: string;
  refresh: string;
}

/**
 * localStorage bisa melempar: mode privat Safari, kuota penuh, atau setelan
 * browser yang memblokir penyimpanan situs. Dibiarkan melempar berarti seluruh
 * aplikasi mati hanya karena token tidak bisa disimpan.
 */
const aman = <T>(fn: () => T, cadangan: T): T => {
  try {
    return fn();
  } catch {
    return cadangan;
  }
};

export const saveTokens = (pair: TokenPair): void => {
  aman(() => {
    localStorage.setItem(ACCESS_KEY, pair.access);
    localStorage.setItem(REFRESH_KEY, pair.refresh);
  }, undefined);
};

export const readTokens = (): TokenPair | null =>
  aman(() => {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);

    // Satu token tanpa pasangannya tidak ada gunanya, access tanpa refresh akan
    // mati dalam 15 menit tanpa bisa diperpanjang.
    if (!access || !refresh) return null;

    return { access, refresh };
  }, null);

export const clearTokens = (): void => {
  aman(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }, undefined);
};
