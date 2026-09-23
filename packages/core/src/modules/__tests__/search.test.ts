import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCollectionInput, addToWishlistInput } from '@kollektor/schemas';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';

const h = useCore();
const { ctx } = h;

beforeAll(async () => {
  await h.setup();
  seedLibrary(ctx.catalog);
  for (const id of [1873013, 2000002, 2000003, 2000004, 2000006, 2000007])
    await ctx.core.collection.add(ctx.userId, addToCollectionInput.parse({ discogsReleaseId: id }));
  // Wishlist items are searchable too.
  await ctx.core.wishlist.add(ctx.userId, addToWishlistInput.parse({ discogsReleaseId: 2000005 }));
});
afterAll(() => h.close());

const search = (q: string) => ctx.core.search.search(ctx.userId, q, 10);

describe('global search', () => {
  it('"Love" finds the artist, albums by that artist, and tracks called love', async () => {
    const r = await search('Love');
    expect(r.artists.map((a) => a.name)).toContain('Love');
    expect(r.albums.map((a) => a.title)).toEqual([]); // no album *titled* love
    const tracks = r.tracks.map((t) => `${t.title} — ${t.artist}`);
    expect(tracks).toEqual(
      expect.arrayContaining([
        'Oh My Love — John Lennon',
        'Whole Lotta Love — Led Zeppelin',
        'All You Need Is Love — The Beatles',
      ]),
    );
    // the wishlist-only track is flagged as not owned
    expect(r.tracks.find((t) => t.title === 'All You Need Is Love')?.collectionItemId).toBeNull();
  });

  it('artist name', async () => {
    const r = await search('pink floyd');
    expect(r.artists[0]).toMatchObject({ name: 'Pink Floyd', itemCount: 2 });
  });

  it('partial album title and artist + album', async () => {
    expect((await search('dark side')).albums[0]?.title).toBe('The Dark Side Of The Moon');
    expect((await search('floyd animals')).albums.map((a) => a.title)).toEqual(['Animals']);
  });

  it('song title, including song + artist', async () => {
    expect((await search('money')).tracks[0]).toMatchObject({
      title: 'Money',
      albumTitle: 'The Dark Side Of The Moon',
    });
    expect((await search('so what miles')).tracks.map((t) => t.title)).toEqual(['So What']);
  });

  it('year, label and catalog number find editions', async () => {
    expect((await search('1973')).releases.map((r) => r.albumTitle)).toEqual([
      'The Dark Side Of The Moon',
    ]);
    expect((await search('EMI')).releases.map((r) => r.albumTitle)).toEqual([
      'The Dark Side Of The Moon',
    ]);
    expect((await search('shvl-815')).releases.map((r) => r.albumTitle)).toEqual(['Animals']);
    expect((await search('harvest 1977')).releases.map((r) => r.albumTitle)).toEqual(['Animals']);
  });

  it('is case and accent insensitive and tolerates typos', async () => {
    expect((await search('LÉD ZEPPELIN')).artists[0]?.name).toBe('Led Zeppelin');
    expect((await search('zepelin')).artists[0]?.name).toBe('Led Zeppelin');
    expect((await search('imagin')).albums[0]?.title).toBe('Imagine');
  });

  it('returns empty groups for blank or unmatched queries', async () => {
    const r = await search('xyzzy qwerty');
    expect([r.artists, r.albums, r.releases, r.tracks].every((g) => g.length === 0)).toBe(true);
  });
});
