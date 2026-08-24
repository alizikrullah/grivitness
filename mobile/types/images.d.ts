/**
 * Deklarasi modul untuk berkas gambar.
 *
 * Metro memperlakukan gambar sebagai modul dan mengembalikan rujukan aset, tapi
 * TypeScript tidak tahu itu: paket `expo` hanya mendeklarasikan modul CSS dan
 * SASS di `expo/types/global.d.ts`, tidak ada satu pun untuk gambar. Tanpa
 * berkas ini `import logo from './logo.png'` ditolak dengan TS2307 padahal
 * Metro memuatnya dengan benar.
 *
 * Tipenya `number` karena di React Native yang dikembalikan adalah id dari
 * registry aset — sama seperti hasil `require()`, dan itulah yang diterima
 * `ImageRequireSource`. Di Expo Web nilainya sebenarnya berupa URL string;
 * perbedaan itu tidak menimbulkan persoalan karena `expo-image` menerima
 * keduanya, tapi jangan pakai nilai ini untuk berhitung.
 */
declare module '*.png' {
  const asset: number;
  export default asset;
}

declare module '*.jpg' {
  const asset: number;
  export default asset;
}

declare module '*.webp' {
  const asset: number;
  export default asset;
}
