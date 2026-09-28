import { addToCollectionInput } from '@kollektor/schemas';
import { describe, expect, it } from 'vitest';
import { blank, parseTracklist, toInput } from '@kollektor/app-logic';
import { parseAmount } from '@kollektor/app-logic';
import {
  activeChips,
  activeCount,
  filtersToParams,
  parseFilters,
  toggleValue,
} from '@/lib/filters';
import {
  badgeMark,
  editionLine,
  formatShort,
  money,
  signed,
  signedMoney,
} from '@kollektor/app-logic';

describe('format', () => {
  it('formats money like the mockups (es-AR grouping, true minus)', () => {
    expect(money(4250, 'USD')).toBe('USD 4.250');
    expect(money(null)).toBe('—');
    expect(signed(1430)).toBe('+1.430');
    expect(signed(-320)).toBe('−320');
    expect(signedMoney(17, 'USD')).toBe('+USD 17');
  });

  it('builds the edition line and short format', () => {
    expect(editionLine('UK', 1973, 'original')).toBe('UK 1973 · 1ª ed.');
    expect(editionLine('Japan', 1976, 'reissue')).toBe('JP 1976 · Reedición');
    expect(editionLine(null, null, null)).toBe('Edición sin datos');
    expect(formatShort('Vinyl, LP, Album')).toBe('LP');
    expect(formatShort('Vinyl, 3×LP, Album, Limited Edition')).toBe('3×LP, Limited Edition');
  });

  it('derives badge marks', () => {
    expect(badgeMark('Primer vinilo')).toBe('1');
    expect(badgeMark('50 discos')).toBe('50');
    expect(badgeMark('5 géneros')).toBe('5G');
    expect(badgeMark('Pink Floyd Complete')).toBe('PF');
    expect(badgeMark('Edición japonesa')).toBe('EJ');
  });
});

describe('amounts', () => {
  it('reads rioplatense and plain amounts', () => {
    expect(parseAmount('35')).toBe(35);
    expect(parseAmount('35.000')).toBe(35000);
    expect(parseAmount('35.000,50')).toBe(35000.5);
    expect(parseAmount('35,5')).toBe(35.5);
    expect(parseAmount('35.5')).toBe(35.5);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('collection filters in the URL', () => {
  it('round-trips filters and ignores junk', () => {
    const f = parseFilters(
      new URLSearchParams(
        'genre=Rock&decade=1970,1980&country=UK&paidMax=200&sort=value_desc&sort=bad&q=love',
      ),
    );
    expect(f).toEqual({
      q: 'love',
      genre: ['Rock'],
      decade: [1970, 1980],
      country: ['UK'],
      paidMax: 200,
      sort: 'value_desc',
    });
    expect(parseFilters(filtersToParams(f))).toEqual(f);
    expect(parseFilters(new URLSearchParams('sort=nope&paidMin=x'))).toEqual({});
  });

  it('toggles chips and counts active filters', () => {
    let f = toggleValue({}, 'decade', 1970);
    expect(f.decade).toEqual([1970]);
    f = toggleValue(f, 'decade', 1970);
    expect(f.decade).toBeUndefined();
    const g = { genre: ['Rock'], paidMin: 10, paidMax: 50, q: 'x' };
    expect(activeCount(g)).toBe(2);
    const chips = activeChips(g, undefined, 'USD');
    expect(chips.map((c) => c.label)).toEqual(['Rock', 'Pagado USD 10–USD 50']);
    expect(chips[1]!.remove(g)).toMatchObject({
      paidMin: undefined,
      paidMax: undefined,
      genre: ['Rock'],
    });
  });
});

describe('manual entry', () => {
  it('parses a pasted tracklist', () => {
    expect(
      parseTracklist('A1 One of These Days 5:57\nA2. A Pillow of Winds\n\nEchoes 23:31'),
    ).toEqual([
      { position: 'A1', title: 'One of These Days', duration: '5:57' },
      { position: 'A2', title: 'A Pillow of Winds', duration: null },
      { position: null, title: 'Echoes', duration: '23:31' },
    ]);
  });

  it('keeps un-numbered titles whole and "/" inside artist names', () => {
    expect(parseTracklist('A Day in the Life\nI Want You 7:47\nB. Side B opener')).toEqual([
      { position: null, title: 'A Day in the Life', duration: null },
      { position: null, title: 'I Want You', duration: '7:47' },
      { position: 'B', title: 'Side B opener', duration: null },
    ]);
    const input = toInput({ ...blank('USD'), artist: 'AC/DC', title: 'Highway to Hell' });
    expect(input.manual?.album.artists).toEqual(['AC/DC']);
    const duo = toInput({ ...blank('USD'), artist: 'Simon; Garfunkel', title: 'x' });
    expect(duo.manual?.album.artists).toEqual(['Simon', 'Garfunkel']);
  });

  it('builds an input the API accepts', () => {
    const v = {
      ...blank('USD'),
      artist: 'Pink Floyd',
      title: 'Meddle',
      year: '1971',
      genre: 'Rock',
      style: 'Prog Rock, Psychedelic Rock',
      tracklist: 'A1 One of These Days 5:57',
      label: 'Harvest',
      catalog: 'SHVL 795',
      format: '2×LP',
      editionType: 'original',
      condMedia: 'VG+',
      price: '45.000',
      currency: 'ARS',
      location: 'Estante 3',
      tags: 'prog, favoritos',
    };
    const input = addToCollectionInput.parse(toInput(v));
    expect(input.manual?.album).toMatchObject({
      artists: ['Pink Floyd'],
      title: 'Meddle',
      originalReleaseYear: 1971,
    });
    expect(input.manual?.album.styles).toEqual(['Prog Rock', 'Psychedelic Rock']);
    expect(input.manual?.release.formats[0]).toMatchObject({ qty: 2, descriptions: ['LP'] });
    expect(input.manual?.release.labels).toEqual([{ name: 'Harvest', catalogNumber: 'SHVL 795' }]);
    expect(input).toMatchObject({
      purchasePrice: 45000,
      purchaseCurrency: 'ARS',
      conditionMedia: 'VG+',
      tags: ['prog', 'favoritos'],
    });
    expect(input.manual?.tracks[0]).toMatchObject({ position: 'A1', duration: 357 });
  });

  it('drops the currency when there is no price', () => {
    const input = addToCollectionInput.parse(toInput({ ...blank('USD'), artist: 'X', title: 'Y' }));
    expect(input.purchasePrice).toBeNull();
    expect(input.purchaseCurrency).toBeNull();
  });
});

describe('post-login redirect', () => {
  it('only allows same-origin paths', async () => {
    const { safeNext } = await import('@/lib/safeNext');
    const o = 'https://kolektorz.app';
    expect(safeNext('/coleccion?genre=Rock', o)).toBe('/coleccion?genre=Rock');
    expect(safeNext('/\\evil.com', o)).toBe('/');
    expect(safeNext('//evil.com', o)).toBe('/');
    expect(safeNext('/%5Cevil.com', o)).toBe('/%5Cevil.com');
    expect(safeNext('https://evil.com', o)).toBe('/');
    expect(safeNext('/\tevil', o)).toBe('/');
    expect(safeNext(null, o)).toBe('/');
  });
});
