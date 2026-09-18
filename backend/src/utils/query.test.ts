import { describe, expect, it } from 'vitest';

import { awalHariWIB, timestampDayFilter, timestampRangeFilter } from './query.js';

/**
 * Regresi untuk bug nyata: minum jam lima pagi WIB tersimpan (201) tapi total
 * hari ini tetap nol, karena batas harinya dibaca Postgres sebagai UTC dan
 * "hari ini" baru mulai jam 07:00 WIB. Sarapan sebelum jam tujuh ikut hilang
 * dari hitungan kalori hari itu.
 */
describe('batas hari WIB untuk kolom timestamp', () => {
  it('awal hari WIB adalah jam 17:00 UTC hari sebelumnya', () => {
    expect(awalHariWIB('2026-09-19')).toBe('2026-09-18T17:00:00.000Z');
  });

  it('filter satu hari memuat catatan jam lima pagi WIB', () => {
    const f = timestampDayFilter('2026-09-19').logged_at as { _gte: string; _lt: string };

    // 05:24 WIB tanggal 19 = 22:24 UTC tanggal 18.
    const minumPagi = '2026-09-18T22:24:59.287Z';

    expect(minumPagi >= f._gte).toBe(true);
    expect(minumPagi < f._lt).toBe(true);
  });

  it('filter satu hari TIDAK memuat jam 23:30 WIB hari sebelumnya', () => {
    const f = timestampDayFilter('2026-09-19').logged_at as { _gte: string; _lt: string };

    // 23:30 WIB tanggal 18 = 16:30 UTC tanggal 18.
    expect('2026-09-18T16:30:00.000Z' >= f._gte).toBe(false);
  });

  it('rentang beberapa hari berakhir di awal hari WIB berikutnya', () => {
    const f = timestampRangeFilter({ from: '2026-09-01', to: '2026-09-07' }).logged_at as {
      _gte: string;
      _lt: string;
    };

    expect(f._gte).toBe('2026-08-31T17:00:00.000Z');
    expect(f._lt).toBe('2026-09-07T17:00:00.000Z');
  });
});
