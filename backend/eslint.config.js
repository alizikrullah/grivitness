import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Konfigurasi ESLint GriviTness.
 *
 * Memakai typed linting (projectService), yang berarti ESLint punya akses ke
 * informasi tipe TypeScript. Itu yang memungkinkan aturan seperti
 * no-floating-promises, aturan paling berharga di codebase ini, karena
 * hampir semua akses data ke Directus itu asinkron dan satu `await` yang
 * kelupaan menghasilkan bug yang sangat sulit dilacak.
 *
 * Aturan yang ditegakkan di sini mencerminkan larangan di CLAUDE.md section 15.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'directus/snapshot.json'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- CLAUDE.md section 15: jangan pakai any ---
      '@typescript-eslint/no-explicit-any': 'error',

      // --- CLAUDE.md section 15: jangan pakai console.log ---
      'no-console': 'error',

      // --- Paling penting di codebase ini ---
      // Setiap akses data adalah HTTP request. Promise yang tidak di-await
      // membuat error hilang diam-diam dan urutan operasi jadi tidak terduga.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // Non-null assertion menyembunyikan asumsi yang bisa meledak saat runtime.
      '@typescript-eslint/no-non-null-assertion': 'error',

      // Variabel tak terpakai boleh kalau sengaja diawali garis bawah,
      // misal parameter next di error handler Express yang wajib ada.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    // Script CLI memang menulis ke stdout sebagai antarmukanya, bukan sebagai
    // sisa debugging. Larangan console tidak berlaku di sini.
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    // smoke-ai.ts ikut di sini karena sama-sama memakai supertest.
    files: ['**/*.test.ts', 'tests/**/*.ts', 'scripts/smoke-ai.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',

      // `res.body` dari supertest memang bertipe any secara desain, tidak ada
      // cara supertest tahu bentuk response endpoint kita. Mengetiknya satu per
      // satu di setiap assertion cuma menambah keriuhan tanpa menambah keamanan,
      // karena yang sedang diperiksa justru bentuk response itu sendiri.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },

  {
    // Berkas konfigurasi ESLint sendiri tidak ikut tsconfig, jadi typed linting
    // tidak bisa dijalankan padanya.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Harus paling akhir: mematikan aturan yang bentrok dengan Prettier.
  prettier,
);
