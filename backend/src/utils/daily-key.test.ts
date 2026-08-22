import { describe, expect, it } from 'vitest';

import { dailyKey, todayInJakarta } from './daily-key.js';

const USER_A = '11111111-2222-3333-4444-555555555555';
const USER_B = '99999999-8888-7777-6666-555555555555';

describe('dailyKey', () => {
  it('menggabungkan user id dan tanggal dengan titik dua', () => {
    expect(dailyKey(USER_A, '2026-08-22')).toBe(`${USER_A}:2026-08-22`);
  });

  /**
   * Inti dari pola ini: user berbeda di tanggal yang sama harus menghasilkan
   * kunci berbeda, supaya unique constraint tidak menghalangi user lain.
   */
  it('menghasilkan kunci berbeda untuk user berbeda di tanggal sama', () => {
    expect(dailyKey(USER_A, '2026-08-22')).not.toBe(dailyKey(USER_B, '2026-08-22'));
  });

  it('menghasilkan kunci berbeda untuk tanggal berbeda pada user sama', () => {
    expect(dailyKey(USER_A, '2026-08-22')).not.toBe(dailyKey(USER_A, '2026-08-23'));
  });

  it('menghasilkan kunci sama persis untuk user dan tanggal yang sama', () => {
    expect(dailyKey(USER_A, '2026-08-22')).toBe(dailyKey(USER_A, '2026-08-22'));
  });

  /**
   * Kolomnya dibatasi 64 karakter di Directus. UUID 36 + ':' + tanggal 10 = 47,
   * jadi masih lapang — tapi diuji supaya batasnya tidak terlanggar diam-diam
   * kalau formatnya berubah suatu saat.
   */
  it('menghasilkan kunci yang muat di kolom 64 karakter', () => {
    expect(dailyKey(USER_A, '2026-08-22').length).toBeLessThanOrEqual(64);
  });

  it.each(['22-08-2026', '2026/08/22', '2026-8-2', 'kemarin', '', '2026-08-22T00:00:00Z'])(
    'menolak format tanggal "%s"',
    (tanggal) => {
      expect(() => dailyKey(USER_A, tanggal)).toThrow();
    },
  );
});

describe('todayInJakarta', () => {
  it('menghasilkan format YYYY-MM-DD', () => {
    expect(todayInJakarta()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('hasilnya bisa langsung dipakai dailyKey', () => {
    expect(() => dailyKey(USER_A, todayInJakarta())).not.toThrow();
  });

  /**
   * WIB itu UTC+7, jadi tanggalnya tidak pernah tertinggal dari tanggal UTC dan
   * paling banyak satu hari di depannya. Ini yang mencegah log jam 7 pagi WIB
   * tercatat sebagai hari sebelumnya.
   */
  it('tidak pernah lebih lambat dari tanggal UTC', () => {
    const jakarta = todayInJakarta();
    const utc = new Date().toISOString().slice(0, 10);

    expect(jakarta >= utc).toBe(true);
  });
});
