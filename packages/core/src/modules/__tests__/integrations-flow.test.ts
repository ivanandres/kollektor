import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addToCollectionInput, collectionQuery } from '@kollektor/schemas';
import { createUser, FakeMusicLinks, FakeRecognizer } from '../../testing';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';

const h = useCore();
const { ctx } = h;
beforeEach(async () => {
  await h.setup();
  seedLibrary(ctx.catalog);
});
afterAll(() => h.close());

describe('music links', () => {
  it('returns only verified matches and caches both hits and misses', async () => {
    const spotify = new FakeMusicLinks('spotify', {
      Money: { url: 'https://open.spotify.com/track/abc', externalId: 'abc', confidence: 0.95 },
      Time: { url: 'https://open.spotify.com/track/low', externalId: 'low', confidence: 0.3 },
    });
    const youtube = new FakeMusicLinks('youtube', {}, true);
    await h.setup({ musicLinks: [spotify, youtube] });
    seedLibrary(ctx.catalog);
    const { item } = await ctx.core.collection.add(
      ctx.userId,
      addToCollectionInput.parse({ discogsReleaseId: 1873013 }),
    );
    const money = item.release.tracks.find((t) => t.title === 'Money')!;
    const time = item.release.tracks.find((t) => t.title === 'Time')!;

    const r = await ctx.core.music.getLinks(ctx.userId, money.id);
    expect(r.track).toMatchObject({
      artist: 'Pink Floyd',
      title: 'Money',
      album: 'The Dark Side Of The Moon',
      durationSeconds: 382,
    });
    expect(r.links.spotify).toEqual({
      status: 'found',
      url: 'https://open.spotify.com/track/abc',
      confidence: 0.95,
    });
    expect(r.links.youtube?.status).toBe('unavailable'); // provider error is not cached as "not found"
    expect(r.lyrics.status).toBe('unavailable');

    const low = await ctx.core.music.getLinks(ctx.userId, time.id);
    expect(low.links.spotify).toEqual({
      status: 'not_found',
      message: 'No encontramos este tema.',
    });

    const calls = spotify.calls;
    await ctx.core.music.getLinks(ctx.userId, money.id);
    await ctx.core.music.getLinks(ctx.userId, time.id);
    expect(spotify.calls).toBe(calls);
  });
});

describe('recognition', () => {
  it('photo → hints → candidate editions to confirm (never auto-selected)', async () => {
    const recognizer = new FakeRecognizer({
      artist: 'Pink Floyd',
      title: 'Dark Side of the Moon',
      catalogNumber: 'SHVL 804',
    });
    await h.setup({ recognizer, config: { visionDailyLimit: 2 } });
    seedLibrary(ctx.catalog);
    const r = await ctx.core.recognition.identifyByPhoto(ctx.userId, [
      { data: 'AAAA', mediaType: 'image/jpeg' },
    ]);
    expect(r.strategies).toEqual(['catalog_number', 'artist_title']);
    expect(r.candidates[0]).toMatchObject({ externalId: '1873013', matchedBy: 'catalog_number' });
    expect(r.candidates.map((c) => c.externalId)).toContain('2000001');
    expect(r.remainingToday).toBe(1);

    await ctx.core.recognition.identifyByPhoto(ctx.userId, [
      { data: 'AAAA', mediaType: 'image/jpeg' },
    ]);
    await expect(
      ctx.core.recognition.identifyByPhoto(ctx.userId, [{ data: 'AAAA', mediaType: 'image/jpeg' }]),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    // Quota is per user
    const other = await createUser(h.db);
    await expect(
      ctx.core.recognition.identifyByPhoto(other, [{ data: 'AAAA', mediaType: 'image/jpeg' }]),
    ).resolves.toBeTruthy();
  });

  it('barcode lookup needs no vision call', async () => {
    ctx.catalog.addRelease({
      id: '999',
      artist: 'Radiohead',
      title: 'OK Computer',
      year: 1997,
      barcode: '724385522925',
    });
    const r = await ctx.core.recognition.identifyByBarcode('724385522925');
    expect(r.candidates.map((c) => c.title)).toEqual(['OK Computer']);
  });

  it('fails clearly when vision is not configured', async () => {
    await expect(ctx.core.recognition.identifyByPhoto(ctx.userId, [])).rejects.toMatchObject({
      code: 'NOT_CONFIGURED',
    });
  });
});

describe('discogs import', () => {
  it('queues every copy, processes in batches and is safe to re-run', async () => {
    ctx.catalog.userCollections.set('ivan', [
      '1873013',
      '2000002',
      '2000003',
      '1873013',
      '2000006',
    ]);
    const started = await ctx.core.imports.startDiscogsImport(ctx.userId, 'ivan');
    expect(started).toMatchObject({ total: 5, queued: 5, status: { pending: 5, done: 0 } });
    const b1 = await ctx.core.imports.runBatch(ctx.userId, 3);
    expect(b1.status).toMatchObject({ pending: 2, done: 3 });
    await ctx.core.imports.runBatch(ctx.userId, 10);
    expect((await ctx.core.collection.list(ctx.userId, collectionQuery.parse({}))).total).toBe(5); // two copies of DSOTM
    // Re-running the import doesn't duplicate
    await ctx.core.imports.startDiscogsImport(ctx.userId, 'ivan');
    await ctx.core.imports.runBatch(ctx.userId, 10);
    expect((await ctx.core.collection.list(ctx.userId, collectionQuery.parse({}))).total).toBe(5);
  });
});

describe('profiles', () => {
  it('creates a private profile with a unique username', async () => {
    const p = await ctx.core.profiles.getProfile(ctx.userId);
    expect(p).toMatchObject({
      profileVisibility: 'private',
      collectionVisibility: 'private',
      showPrices: false,
      baseCurrency: 'USD',
    });
    expect(p.username).toMatch(/^test_user/);
    const other = await createUser(h.db, 'Test User');
    expect((await ctx.core.profiles.ensureProfile(other)).username).not.toBe(p.username);
    await expect(
      ctx.core.profiles.updateProfile(other, { username: p.username }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('public profile hides everything until the owner opts in', async () => {
    const p = await ctx.core.profiles.getProfile(ctx.userId);
    await expect(ctx.core.profiles.getPublicProfile(p.username)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await ctx.core.profiles.updateProfile(ctx.userId, {
      profileVisibility: 'public',
      bio: 'Coleccionista de prog',
    });
    const pub = await ctx.core.profiles.getPublicProfile(p.username);
    expect(pub).toEqual({
      username: p.username,
      displayName: 'Test User',
      avatarUrl: null,
      bio: 'Coleccionista de prog',
      collectionVisible: false,
      wishlistVisible: false,
    });
  });
});
