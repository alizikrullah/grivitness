import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint + typescript-eslint, sama seperti backend.
 *
 * Aturan paling berharga di sini tetap `no-floating-promises`: hampir semua
 * akses data bersifat asinkron, dan satu `await` yang kelupaan membuat error
 * hilang diam-diam tanpa jejak apa pun di layar.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Diambil dari namespace `flat`, BUKAN reactHooks.configs['recommended-latest'].
  // Yang di luar `flat` masih memakai bentuk lama dengan `plugins` sebagai array
  // string, dan ESLint 10 menolaknya sebelum satu berkas pun sempat diperiksa.
  reactHooks.configs.flat.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Berkas konfigurasi berjalan di Node, bukan di browser.
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },

  /**
   * Aturan bertipe dimatikan untuk berkas .js.
   *
   * recommendedTypeChecked berlaku ke SEMUA berkas, termasuk eslint.config.js
   * itu sendiri — padahal berkas itu bukan bagian dari program TypeScript, jadi
   * tidak punya informasi tipe untuk dibaca. Tanpa pengecualian ini ESLint
   * berhenti dengan error sebelum satu berkas pun sempat diperiksa.
   */
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },

  prettier,
);
