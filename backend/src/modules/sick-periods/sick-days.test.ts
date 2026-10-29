import { describe, expect, it } from 'vitest';

import { type PeriodeSakit, periodePada, tanggalSakit, ubahTandaSakit } from './sick-days.js';

const HARI_INI = '2026-10-29';

describe('ubahTandaSakit: menyalakan', () => {
  it('hari sesudah semua rentang memulai rentang terbuka', () => {
    expect(ubahTandaSakit([], '2026-10-22', true, HARI_INI)).toEqual([
      { jenis: 'create', start_date: '2026-10-22', end_date: null },
    ]);
  });

  it('tanggal yang sudah sakit tidak mengubah apa pun', () => {
    const p: PeriodeSakit[] = [{ id: 'a', start_date: '2026-10-22', end_date: null }];
    expect(ubahTandaSakit(p, '2026-10-25', true, HARI_INI)).toEqual([]);
  });

  it('sebelum rentang lain cuma menandai hari itu, digabung kalau bersebelahan', () => {
    const p: PeriodeSakit[] = [{ id: 'a', start_date: '2026-10-25', end_date: null }];
    expect(ubahTandaSakit(p, '2026-10-20', true, HARI_INI)).toEqual([
      { jenis: 'create', start_date: '2026-10-20', end_date: '2026-10-20' },
    ]);
    expect(ubahTandaSakit(p, '2026-10-24', true, HARI_INI)).toEqual([
      { jenis: 'update', id: 'a', start_date: '2026-10-24' },
    ]);
  });

  it('sehari sesudah rentang tertutup melanjutkannya sampai sembuh lagi', () => {
    const p: PeriodeSakit[] = [{ id: 'a', start_date: '2026-10-22', end_date: '2026-10-24' }];
    expect(ubahTandaSakit(p, '2026-10-25', true, HARI_INI)).toEqual([
      { jenis: 'update', id: 'a', end_date: null },
    ]);
  });

  it('celah satu hari di antara dua rentang menggabungkan keduanya', () => {
    const p: PeriodeSakit[] = [
      { id: 'a', start_date: '2026-10-20', end_date: '2026-10-21' },
      { id: 'b', start_date: '2026-10-23', end_date: '2026-10-24' },
    ];
    expect(ubahTandaSakit(p, '2026-10-22', true, HARI_INI)).toEqual([
      { jenis: 'update', id: 'a', end_date: '2026-10-24' },
      { jenis: 'delete', id: 'b' },
    ]);
  });
});

describe('ubahTandaSakit: mematikan', () => {
  it('di rentang terbuka berarti sembuh mulai tanggal itu', () => {
    const p: PeriodeSakit[] = [{ id: 'a', start_date: '2026-10-22', end_date: null }];
    expect(ubahTandaSakit(p, '2026-10-25', false, HARI_INI)).toEqual([
      { jenis: 'update', id: 'a', end_date: '2026-10-24' },
    ]);
  });

  it('di hari pertama menggeser awalnya, atau menghapus kalau tidak tersisa', () => {
    const p: PeriodeSakit[] = [{ id: 'a', start_date: '2026-10-22', end_date: '2026-10-24' }];
    expect(ubahTandaSakit(p, '2026-10-22', false, HARI_INI)).toEqual([
      { jenis: 'update', id: 'a', start_date: '2026-10-23' },
    ]);

    const satuHari: PeriodeSakit[] = [
      { id: 'b', start_date: '2026-10-22', end_date: '2026-10-22' },
    ];
    expect(ubahTandaSakit(satuHari, '2026-10-22', false, HARI_INI)).toEqual([
      { jenis: 'delete', id: 'b' },
    ]);

    const mulaiHariIni: PeriodeSakit[] = [{ id: 'c', start_date: HARI_INI, end_date: null }];
    expect(ubahTandaSakit(mulaiHariIni, HARI_INI, false, HARI_INI)).toEqual([
      { jenis: 'delete', id: 'c' },
    ]);
  });

  it('di tengah rentang tertutup cuma hari itu yang dicabut', () => {
    const p: PeriodeSakit[] = [{ id: 'a', start_date: '2026-10-20', end_date: '2026-10-24' }];
    expect(ubahTandaSakit(p, '2026-10-22', false, HARI_INI)).toEqual([
      { jenis: 'update', id: 'a', end_date: '2026-10-21' },
      { jenis: 'create', start_date: '2026-10-23', end_date: '2026-10-24' },
    ]);
  });

  it('tanggal yang tidak sakit tidak mengubah apa pun', () => {
    expect(ubahTandaSakit([], '2026-10-22', false, HARI_INI)).toEqual([]);
  });
});

describe('tanggalSakit dan periodePada', () => {
  const p: PeriodeSakit[] = [
    { id: 'a', start_date: '2026-10-20', end_date: '2026-10-21' },
    { id: 'b', start_date: '2026-10-27', end_date: null },
  ];

  it('rentang terbuka berlaku sampai hari ini, dipotong ke jendela', () => {
    expect([...tanggalSakit(p, '2026-10-21', HARI_INI, HARI_INI)]).toEqual([
      '2026-10-21',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
  });

  it('menemukan rentang yang memuat tanggal', () => {
    expect(periodePada(p, '2026-10-20')?.id).toBe('a');
    expect(periodePada(p, '2026-10-24')).toBeNull();
    expect(periodePada(p, '2026-11-15')?.id).toBe('b');
  });
});
