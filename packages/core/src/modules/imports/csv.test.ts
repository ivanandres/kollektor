import { describe, expect, it } from 'vitest';
import { mapHeader, parseCsv, parseDate, parseGrade, parsePrice } from './csv';

describe('CSV helpers', () => {
  it('parses quotes, escaped quotes, CRLF, BOM and semicolons', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('artista;álbum\nSoda Stereo;Signos')).toEqual([
      ['artista', 'álbum'],
      ['Soda Stereo', 'Signos'],
    ]);
  });
  it('maps Discogs export and Spanish headers', () => {
    expect(
      mapHeader(['Catalog#', 'Artist', 'Title', 'release_id', 'Collection Media Condition']),
    ).toMatchObject({
      catalogNumber: 0,
      artist: 1,
      title: 2,
      releaseId: 3,
      mediaCondition: 4,
    });
    expect(mapHeader(['Artista', 'Álbum', 'Año', 'Sello', 'Precio', 'Ubicación'])).toMatchObject({
      artist: 0,
      title: 1,
      year: 2,
      label: 3,
      price: 4,
      location: 5,
    });
  });
  it('parses grades, prices and dates in common formats', () => {
    expect(parseGrade('Near Mint (NM or M-)')).toBe('NM');
    expect(parseGrade('Very Good Plus (VG+)')).toBe('VG+');
    expect(parseGrade('Mint (M)')).toBe('M');
    expect(parseGrade('VG')).toBe('VG');
    expect(parsePrice('$ 35.000,50')).toEqual({ amount: 35000.5, currency: null });
    expect(parsePrice('USD 20')).toEqual({ amount: 20, currency: 'USD' });
    expect(parsePrice('1,200.00')).toEqual({ amount: 1200, currency: null });
    expect(parsePrice('$ 45.000')).toEqual({ amount: 45000, currency: null });
    expect(parsePrice('12.99')).toEqual({ amount: 12.99, currency: null });
    expect(parseDate('12/03/2024')).toBe('2024-03-12');
    expect(parseDate('2024-03-12 10:00:00')).toBe('2024-03-12');
    expect(parseDate('05/13/2024')).toBeNull();
    expect(parseDate('2024-02-31')).toBeNull();
    expect(parsePrice('US$ 20')).toEqual({ amount: 20, currency: 'USD' });
    expect(parsePrice('U$S 20')).toEqual({ amount: 20, currency: 'USD' });
    expect(parsePrice('USD20')).toEqual({ amount: 20, currency: 'USD' });
    expect(parsePrice('€ 20')).toEqual({ amount: 20, currency: 'EUR' });
    expect(parseCsv('a,b\nSoda,Maxi 12" vinilo\nCharly,Clics')).toEqual([
      ['a', 'b'],
      ['Soda', 'Maxi 12" vinilo'],
      ['Charly', 'Clics'],
    ]);
  });
});
