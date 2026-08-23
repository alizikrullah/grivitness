import * as SecureStore from 'expo-secure-store';

/**
 * Penyimpanan token.
 *
 * Sengaja memakai SecureStore, bukan AsyncStorage. AsyncStorage menyimpan data
 * sebagai berkas biasa yang bisa dibaca siapa pun di perangkat yang sudah
 * di-root. SecureStore menaruhnya di Keychain (iOS) dan Keystore (Android).
 */
const ACCESS_KEY = 'grivitness.access_token';
const REFRESH_KEY = 'grivitness.refresh_token';

export interface TokenPair {
  access: string;
  refresh: string;
}

export const saveTokens = async (pair: TokenPair): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, pair.access),
    SecureStore.setItemAsync(REFRESH_KEY, pair.refresh),
  ]);
};

export const readTokens = async (): Promise<TokenPair | null> => {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);

  // Satu token tanpa pasangannya tidak ada gunanya — access tanpa refresh akan
  // mati dalam 15 menit tanpa bisa diperpanjang.
  if (!access || !refresh) return null;

  return { access, refresh };
};

export const clearTokens = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
};
