import { describe, expect, it } from 'vitest';
import release from './fixtures/release.json';
import { mapRelease, mapSearchResult, mapPriceSuggestions, parseDuration } from './mapper';
import { RateLimiter } from './rate-limiter';
import { DiscogsService } from './service';

function mockFetch(
  routes: Record<
    string,
    | { status?: number; body: unknown; headers?: Record<string, string> }
    | (() => { status?: number; body: unknown })
  >,
) {
  const calls: { url: string; headers: Headers }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: new Headers(init?.headers) });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const route = key ? routes[key] : undefined;
    const r = typeof route === 'function' ? route() : route;
    if (!r) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: {
        'content-type': 'application/json',
        ...(('headers' in r ? r.headers : undefined) as Record<string, string> | undefined),
      },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const noWaitLimiter = () =>
  new RateLimiter(
    60,
    () => 0,
    async () => {},
  );

describe('discogs mapper', () => {
  it('maps a release into the domain shape', () => {
    const r = mapRelease(release as never);
    expect(r).toMatchObject({
      externalId: '1873013',
      title: 'The Dark Side Of The Moon',
      year: 1973,
      releaseDate: '1973-03-23',
      country: 'UK',
      masterId: '10362',
      barcodes: ['5099902987613'],
      formatSummary: 'Vinyl, LP, Album, Stereo, Gatefold',
      lowestPrice: { amount: 249.99, currency: 'USD' },
    });
    expect(r.labels).toEqual([
      { externalId: '2331', name: 'Harvest', catalogNumber: 'SHVL 804' },
      { externalId: '26126', name: 'EMI', catalogNumber: 'SHVL 804' },
    ]);
    // headings dropped, index sub-tracks flattened, per-track credits kept
    expect(r.tracklist.map((t) => t.position)).toEqual(['A1', 'A2', 'B1', 'B4a', 'B4b']);
    expect(r.tracklist[2]).toMatchObject({ title: 'Money', durationSeconds: 382 });
    expect(r.tracklist[4]?.artistCredit).toBe('Roger Waters & David Gilmour');
    expect(r.images[0]).toMatchObject({
      kind: 'primary',
      url: 'https://i.discogs.com/primary.jpg',
    });
  });

  it('parses search results and durations defensively', () => {
    expect(
      mapSearchResult({
        id: 1,
        type: 'release',
        title: 'Love - Forever Changes',
        year: '1967',
        label: ['Elektra', 'Elektra'],
        catno: 'EKS-74013',
        format: ['Vinyl', 'LP'],
        barcode: ['07559 74013 2'],
      }),
    ).toMatchObject({
      artist: 'Love',
      title: 'Forever Changes',
      year: 1967,
      labels: ['Elektra'],
      barcodes: ['07559740132'],
    });
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('1:02:03')).toBe(3723);
  });

  it('maps price suggestions to Goldmine grades', () => {
    expect(
      mapPriceSuggestions({
        'Near Mint (NM or M-)': { currency: 'USD', value: 301.456 },
        'Very Good Plus (VG+)': { currency: 'USD', value: 200 },
        Weird: { currency: 'USD', value: 1 },
      }),
    ).toEqual([
      { kind: 'suggestion', condition: 'NM', amount: 301.46, currency: 'USD' },
      { kind: 'suggestion', condition: 'VG+', amount: 200, currency: 'USD' },
    ]);
  });
});

describe('DiscogsService', () => {
  it('sends auth + user agent and maps search params', async () => {
    const f = mockFetch({
      '/database/search': {
        body: {
          pagination: { page: 1, pages: 1, items: 1 },
          results: [
            { id: 5, type: 'release', title: 'A - B' },
            { id: 6, type: 'artist', title: 'A' },
          ],
        },
      },
    });
    const svc = new DiscogsService({
      token: 'tok',
      userAgent: 'Kollektor/test',
      fetch: f.impl,
      limiter: noWaitLimiter(),
    });
    const res = await svc.search({
      type: 'release',
      catalogNumber: 'SHVL 804',
      barcode: '5 0999-02',
      page: 1,
      perPage: 20,
    });
    expect(res.items).toHaveLength(1);
    const call = f.calls[0]!;
    expect(call.headers.get('authorization')).toBe('Discogs token=tok');
    expect(call.headers.get('user-agent')).toBe('Kollektor/test');
    const url = new URL(call.url);
    expect(url.searchParams.get('catno')).toBe('SHVL 804');
    expect(url.searchParams.get('barcode')).toBe('5099902');
    expect(url.searchParams.has('q')).toBe(false);
  });

  it('retries on 429 and succeeds', async () => {
    let n = 0;
    const f = mockFetch({
      '/releases/1873013': () => (n++ === 0 ? { status: 429, body: {} } : { body: release }),
    });
    const svc = new DiscogsService({
      token: 't',
      userAgent: 'u',
      fetch: f.impl,
      limiter: noWaitLimiter(),
    });
    const origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => origSetTimeout(fn, 0)) as typeof setTimeout;
    try {
      expect((await svc.getRelease('1873013')).title).toBe('The Dark Side Of The Moon');
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
    expect(f.calls).toHaveLength(2);
  });

  it('falls back from price suggestions to lowest listing when not allowed', async () => {
    const f = mockFetch({
      '/marketplace/price_suggestions/1': {
        status: 403,
        body: { message: 'seller settings required' },
      },
      '/marketplace/stats/1': {
        body: { lowest_price: { currency: 'USD', value: 20 }, num_for_sale: 3 },
      },
    });
    const svc = new DiscogsService({
      token: 't',
      userAgent: 'u',
      fetch: f.impl,
      limiter: noWaitLimiter(),
    });
    expect(await svc.getMarketValues('1')).toEqual([
      { kind: 'lowest', condition: null, amount: 20, currency: 'USD' },
    ]);
  });
});

describe('DiscogsService.listUserCollection', () => {
  it('pages through a public collection and maps private/missing users to domain errors', async () => {
    const f = mockFetch({
      '/users/ivan/collection': {
        body: {
          pagination: { page: 1, pages: 1, items: 2 },
          releases: [
            { id: 10, instance_id: 99, date_added: '2020-01-01T00:00:00-08:00' },
            { id: 10, instance_id: 100 },
          ],
        },
      },
      '/users/private/collection': { status: 403, body: {} },
    });
    const svc = new DiscogsService({
      token: 't',
      userAgent: 'u',
      fetch: f.impl,
      limiter: noWaitLimiter(),
    });
    const res = await svc.listUserCollection('ivan');
    expect(res.items).toEqual([
      { instanceId: '99', externalReleaseId: '10', dateAdded: '2020-01-01T00:00:00-08:00' },
      { instanceId: '100', externalReleaseId: '10', dateAdded: null },
    ]);
    await expect(svc.listUserCollection('private')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(svc.listUserCollection('nobody')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('RateLimiter', () => {
  it('spaces requests and pauses when remaining quota is low', async () => {
    let t = 0;
    const waits: number[] = [];
    const rl = new RateLimiter(
      60,
      () => t,
      async (ms) => {
        waits.push(ms);
      },
    );
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    expect(waits).toEqual([1000, 2000]);
    rl.observe(1);
    t = 500;
    await rl.acquire();
    expect(waits.at(-1)).toBe(59_500);
  });
});
