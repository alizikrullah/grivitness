import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Varian variabel di-host sendiri, bukan lewat Google Fonts CDN. Satu berkas
// menutupi seluruh rentang ketebalan, dan tidak ada permintaan ke domain lain
// yang bisa lambat atau diblokir.
import '@fontsource-variable/plus-jakarta-sans';

import { App } from './App';
import './styles/global.css';

const root = document.getElementById('root');

// Melempar, bukan diam. Kalau elemennya hilang, halaman akan kosong tanpa
// petunjuk apa pun di konsol — dan itu jauh lebih lama ditelusuri.
if (!root) throw new Error('Elemen #root tidak ditemukan di index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
