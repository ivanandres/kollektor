import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { collectionQuery, addToCollectionInput } from '@kollektor/schemas';
import { createUser } from '../../testing';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';

const h = useCore();
const { ctx } = h;
beforeEach(async () => {
  await h.setup();
  seedLibrary(ctx.catalog);
});
afterAll(() => h.close());

const q = (input: Record<string, unknown> = {}) => collectionQuery.parse(input);
const add = (input: Record<string, unknown>, userId = ctx.userId) =>
  ctx.core.collection.add(userId, addToCollectionInput.parse(input));

describe('catalog import', () => {
  it('imports a Discogs release once with album, labels, formats and tracklist', async () => {
    const id1 = await ctx.core.catalog.importFromProvider('1873013');
    const id2 = await ctx.core.catalog.importFromProvider('1873013');
    expect(id2).toBe(id1);
    const detail = await ctx.core.catalog.getReleaseDetail(ctx.userId, id1);
    expect(detail.album.title).toBe('The Dark Side Of The Moon');
    expect(detail.album.artistDisplay).toBe('Pink Floyd');
    expect(detail.album.originalReleaseYear).toBe(1973);
    expect(detail.labels.map((l) => l.catalogNumber)).toEqual(['SHVL 804', 'SHVL 804']);
    expect(detail.tracks).toHaveLength(10);
    expect(detail.tracks[5]).toMatchObject({
      position: 'B1',
      side: 'B',
      title: 'Money',
      durationSeconds: 382,
    });
    expect(detail.editionType).toBe('original');
    expect(detail.external[0]).toMatchObject({ source: 'discogs', externalId: '1873013' });
  });

  it('groups editions of the same master under one album', async () => {
    const uk = await ctx.core.catalog.importFromProvider('1873013');
    const jp = await ctx.core.catalog.importFromProvider('2000001');
    const albumId = await ctx.core.catalog.albumIdOfRelease(uk);
    expect(await ctx.core.catalog.albumIdOfRelease(jp)).toBe(albumId);
    const editions = await ctx.core.catalog.listAlbumReleases(ctx.userId, albumId);
    expect(editions.map((e) => e.country).sort()).toEqual(['Japan', 'UK']);
  });

  it('infers edition type from format descriptions', async () => {
    const id = await ctx.core.catalog.importFromProvider('2000006');
    const d = await ctx.core.catalog.getReleaseDetail(ctx.userId, id);
    expect(d.editionType).toBe('limited');
    expect(d.formats[0]).toMatchObject({ name: 'Vinyl', color: 'Red' });
  });

  it('keeps manual entries private to their creator', async () => {
    const { item } = await add({
      manual: {
        album: {
          artists: ['Spinetta Jade'],
          title: 'Bajo Belgrano',
          originalReleaseYear: 1983,
          genres: ['Rock'],
        },
        release: {
          year: 1983,
          country: 'Argentina',
          labels: [{ name: 'EMI', catalogNumber: '6444' }],
        },
        tracks: [{ position: 'A1', title: 'Resumen Porteño', duration: '4:10' }],
      },
    });
    expect(item.release.isVerified).toBe(false);
    expect(item.release.tracks[0]).toMatchObject({ side: 'A', durationSeconds: 250 });
    const other = await createUser(h.db, 'Other');
    await expect(ctx.core.catalog.getReleaseDetail(other, item.release.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('collection', () => {
  it('adds an item from Discogs, converts price to base currency and computes value', async () => {
    const { item, unlockedAchievements } = await add({
      discogsReleaseId: 1873013,
      purchasePrice: 35000,
      purchaseCurrency: 'ars',
      purchaseDate: '2024-05-01',
      conditionMedia: 'VG+',
      conditionSleeve: 'VG',
      storageLocation: 'Estante 2',
      tags: ['favoritos', 'prog'],
    });
    expect(item.value).toMatchObject({
      baseCurrency: 'USD',
      paid: 35,
      estimated: 300,
      difference: 265,
    });
    expect(item.value.estimate?.kind).toBe('lowest');
    expect(item.value.disclaimer).toMatch(/estimado/i);
    expect(item.tags).toEqual(['favoritos', 'prog']);
    expect(unlockedAchievements).toEqual([]); // no achievements seeded in this suite
  });

  it('allows several copies of the same edition and editions of the same album', async () => {
    await add({ discogsReleaseId: 1873013 });
    await add({ discogsReleaseId: 1873013 });
    const { item } = await add({ discogsReleaseId: 2000001 });
    expect(item.otherCopiesCount).toBe(0);
    const res = await ctx.core.collection.list(ctx.userId, q());
    expect(res.total).toBe(3);
  });

  it('manual value override wins over market data', async () => {
    const { item } = await add({
      discogsReleaseId: 1873013,
      valueOverride: 80,
      valueOverrideCurrency: 'EUR',
    });
    expect(item.value.estimated).toBe(88);
    expect(item.value.estimate?.source).toBe('manual');
  });

  it('is idempotent with a clientRequestId (retries on bad connections)', async () => {
    const first = await add({ discogsReleaseId: 1873013, clientRequestId: 'req-12345678' });
    const retry = await add({ discogsReleaseId: 1873013, clientRequestId: 'req-12345678' });
    expect(first.replayed).toBe(false);
    expect(retry).toMatchObject({ replayed: true, item: { id: first.item.id } });
    expect((await ctx.core.collection.list(ctx.userId, q())).total).toBe(1);
  });

  it('rejects a price without currency', () => {
    expect(() => addToCollectionInput.parse({ discogsReleaseId: 1, purchasePrice: 10 })).toThrow();
  });

  it('isolates collections between users', async () => {
    const { item } = await add({ discogsReleaseId: 1873013 });
    const other = await createUser(h.db, 'Other');
    await expect(ctx.core.collection.get(other, item.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await ctx.core.collection.list(other, q())).total).toBe(0);
  });

  it('updates, re-tags and soft-deletes', async () => {
    const { item } = await add({ discogsReleaseId: 2000002, tags: ['a'] });
    const { item: updated } = await ctx.core.collection.update(ctx.userId, item.id, {
      notes: 'Tapa con ring wear',
      tags: ['b'],
      purchasePrice: 20,
      purchaseCurrency: 'USD',
    });
    expect(updated).toMatchObject({ notes: 'Tapa con ring wear', tags: ['b'] });
    expect(updated.value.paid).toBe(20);
    await ctx.core.collection.remove(ctx.userId, item.id);
    expect((await ctx.core.collection.list(ctx.userId, q())).total).toBe(0);
  });

  it('filters combine: genre + decade + artist + country + format', async () => {
    for (const id of [1873013, 2000001, 2000002, 2000003, 2000006, 2000007])
      await add({ discogsReleaseId: id });
    const titles = async (f: Record<string, unknown>) =>
      (await ctx.core.collection.list(ctx.userId, q(f))).items
        .map((i) => `${i.title}|${i.country}`)
        .sort();

    expect(await titles({ genre: 'Rock', decade: '1970' })).toEqual([
      'Animals|UK',
      'The Dark Side Of The Moon|Japan',
      'The Dark Side Of The Moon|UK',
    ]);
    expect(await titles({ genre: 'Jazz', country: 'Japan', decade: 1950 })).toEqual([
      'Kind Of Blue|Japan',
    ]);
    expect(await titles({ format: 'Limited Edition' })).toEqual(['Kind Of Blue|Japan']);
    expect(await titles({ country: 'UK', style: 'Hard Rock' })).toEqual(['Led Zeppelin II|UK']);
    expect(await titles({ label: 'Harvest', yearFrom: 1975 })).toEqual(['Animals|UK']);
    expect(await titles({ q: 'money' })).toEqual([
      'The Dark Side Of The Moon|Japan',
      'The Dark Side Of The Moon|UK',
    ]);
    expect(await titles({ q: 'shvl 804' })).toEqual(['The Dark Side Of The Moon|UK']);
    const facets = await ctx.core.collection.facets(ctx.userId);
    expect(facets.countries[0]).toMatchObject({ value: 'UK', count: 3 });
    expect(facets.decades.map((d) => Number(d.value))).toEqual([1950, 1960, 1970]);
    expect(facets.artists[0]).toMatchObject({ value: 'Pink Floyd', count: 3 });
  });

  it('sorts and paginates', async () => {
    for (const id of [2000003, 1873013, 2000006]) await add({ discogsReleaseId: id });
    const page1 = await ctx.core.collection.list(ctx.userId, q({ sort: 'year_asc', pageSize: 2 }));
    expect(page1.items.map((i) => i.originalReleaseYear)).toEqual([1959, 1967]);
    expect(page1.pages).toBe(2);
    const byArtist = await ctx.core.collection.list(ctx.userId, q({ sort: 'artist_asc' }));
    expect(byArtist.items.map((i) => i.artist)).toEqual(['Love', 'Miles Davis', 'Pink Floyd']);
  });
});
