import { describe, expect, it } from 'vitest';
import { decadeOf, normalizeCatalogNumber, normalizeText, sideFromPosition, sortName, stripDisambiguation } from './normalize';

describe('normalize', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalizeText('  Él Mató a un Policía Motorizado! ')).toBe('el mato a un policia motorizado');
    expect(normalizeText('Simon & Garfunkel')).toBe('simon and garfunkel');
    expect(normalizeText('"Heroes"')).toBe('heroes');
  });
  it('builds record-store sort names', () => {
    expect(sortName('The Beatles')).toBe('beatles');
    expect(sortName('Los Redondos')).toBe('redondos');
    expect(sortName('Pink Floyd')).toBe('pink floyd');
  });
  it('normalizes catalog numbers', () => {
    expect(normalizeCatalogNumber('SHVL 804')).toBe(normalizeCatalogNumber('shvl-804'));
  });
  it('parses sides, decades and disambiguation', () => {
    expect(sideFromPosition('B12')).toBe('B');
    expect(sideFromPosition('1-04')).toBeNull();
    expect(decadeOf(1973)).toBe(1970);
    expect(stripDisambiguation('Love (2)')).toBe('Love');
  });
});
