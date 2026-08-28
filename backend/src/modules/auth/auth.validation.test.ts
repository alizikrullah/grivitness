import { describe, expect, it } from 'vitest';

import { LoginSchema, RegisterSchema } from './auth.validation.js';

describe('RegisterSchema', () => {
  const valid = {
    email: 'ali@example.com',
    password: 'RahasiaBanget123',
    name: 'Ali Zikrullah',
  };

  it('menerima data yang benar', () => {
    expect(RegisterSchema.safeParse(valid).success).toBe(true);
  });

  /**
   * Email dinormalkan sebelum disimpan supaya "Ali@Example.com" dan
   * "ali@example.com" tidak bisa jadi dua akun berbeda.
   */
  it('menurunkan huruf besar dan memangkas spasi pada email', () => {
    const hasil = RegisterSchema.parse({ ...valid, email: '  Ali@Example.COM  ' });

    expect(hasil.email).toBe('ali@example.com');
  });

  it('memangkas spasi pada nama', () => {
    const hasil = RegisterSchema.parse({ ...valid, name: '  Ali Zikrullah  ' });

    expect(hasil.name).toBe('Ali Zikrullah');
  });

  it.each(['bukanemail', 'ali@', '@example.com', 'ali example.com', ''])(
    'menolak email tidak valid "%s"',
    (email) => {
      expect(RegisterSchema.safeParse({ ...valid, email }).success).toBe(false);
    },
  );

  it('menolak password kurang dari 8 karakter', () => {
    expect(RegisterSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false);
  });

  it('menerima password tepat 8 karakter', () => {
    expect(RegisterSchema.safeParse({ ...valid, password: '12345678' }).success).toBe(true);
  });

  /**
   * bcrypt hanya membaca 72 byte pertama dan membuang sisanya tanpa peringatan.
   * Tanpa batas ini, dua password berbeda yang 72 karakter awalnya sama akan
   * dianggap identik saat login, user mengira password panjangnya aman padahal
   * bagian belakangnya tidak pernah ikut diperiksa.
   */
  it('menolak password lebih dari 72 karakter karena batas bcrypt', () => {
    expect(RegisterSchema.safeParse({ ...valid, password: 'a'.repeat(73) }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...valid, password: 'a'.repeat(72) }).success).toBe(true);
  });

  it('menolak nama kurang dari 2 karakter', () => {
    expect(RegisterSchema.safeParse({ ...valid, name: 'A' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });

  it('membuang field yang tidak dikenal', () => {
    const hasil = RegisterSchema.parse({ ...valid, is_admin: true });

    expect(hasil).not.toHaveProperty('is_admin');
  });
});

describe('LoginSchema', () => {
  /**
   * Aturan panjang password sengaja TIDAK dipakai saat login. Kalau suatu saat
   * aturannya diperketat, user lama tetap harus bisa masuk dengan password
   * yang sudah terlanjur dibuat.
   */
  it('menerima password pendek yang tidak lolos aturan register', () => {
    const hasil = LoginSchema.safeParse({ email: 'ali@example.com', password: 'abc' });

    expect(hasil.success).toBe(true);
  });

  it('tetap menolak password kosong', () => {
    expect(LoginSchema.safeParse({ email: 'ali@example.com', password: '' }).success).toBe(false);
  });

  it('menormalkan email sama seperti saat register', () => {
    const hasil = LoginSchema.parse({ email: '  Ali@Example.COM  ', password: 'apapun' });

    expect(hasil.email).toBe('ali@example.com');
  });
});
