const expoConfig = require('eslint-config-expo/flat');

/**
 * Aturan import/* yang butuh penelusuran modul dimatikan.
 *
 * Penelusurnya (unrs-resolver) adalah binary native yang butuh Visual C++
 * Redistributable, dan runtime itu tidak terpasang di mesin pengembangan ini, * persoalan yang sama membuat Biome tidak bisa dipakai di backend. Tanpa
 * dimatikan, ESLint berhenti dengan "Cannot find native binding" dan tidak ada
 * satu berkas pun yang sempat diperiksa.
 *
 * Yang hilang kecil: `tsc --noEmit` sudah menolak setiap impor yang tidak bisa
 * diselesaikan, jadi jalur impor tetap terjaga. Jalankan `npm run typecheck`
 * bersama lint, bukan salah satunya saja.
 */
module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'expo-env.d.ts'],
  },
  {
    rules: {
      'import/namespace': 'off',
      'import/no-unresolved': 'off',
      'import/default': 'off',
      'import/export': 'off',
      'import/no-named-as-default': 'off',
      'import/no-named-as-default-member': 'off',
      'import/no-duplicates': 'off',
    },
  },
];
