import type { CatalogSearchQuery } from '@kollektor/schemas';
import { normalizeText } from '../lib/normalize';
import type {
  CatalogProvider,
  CatalogSearchResult,
  CoverRecognizer,
  ExternalMaster,
  ExternalRelease,
  FxRateProvider,
  MarketValue,
  MarketValueProvider,
  MusicLinkMatch,
  MusicLinkProvider,
  RecognitionHints,
  TrackQuery,
} from '../ports';

/** Fixed rates, units of quote per 1 base. */
export class FakeFx implements FxRateProvider {
  readonly source = 'fake-fx';
  calls = 0;
  constructor(
    private rates: Record<string, number> = {
      'ARS/USD': 0.001,
      'EUR/USD': 1.1,
      'USD/ARS': 1000,
      'USD/EUR': 0.9,
    },
  ) {}
  async getRate(base: string, quote: string): Promise<number | null> {
    this.calls++;
    return this.rates[`${base}/${quote}`] ?? null;
  }
}

export interface FakeReleaseSpec {
  id: string;
  artist: string;
  artistId?: string;
  title: string;
  year: number | null;
  masterId?: string | null;
  masterYear?: number | null;
  country?: string | null;
  labels?: { name: string; catno: string; id?: string }[];
  formats?: { name: string; qty?: number; descriptions: string[]; text?: string | null }[];
  tracks?: [string, string, string?][];
  genres?: string[];
  styles?: string[];
  barcode?: string | null;
  lowestPrice?: number | null;
}

export function makeRelease(s: FakeReleaseSpec): ExternalRelease {
  return {
    source: 'discogs',
    externalId: s.id,
    url: `https://www.discogs.com/release/${s.id}`,
    title: s.title,
    artists: [{ externalId: s.artistId ?? `a-${normalizeText(s.artist)}`, name: s.artist }],
    year: s.year,
    releaseDate: null,
    country: s.country ?? 'UK',
    genres: s.genres ?? ['Rock'],
    styles: s.styles ?? [],
    labels: (s.labels ?? []).map((l) => ({
      externalId: l.id ?? `l-${normalizeText(l.name)}`,
      name: l.name,
      catalogNumber: l.catno,
    })),
    formats:
      s.formats ??
      [{ name: 'Vinyl', qty: 1, descriptions: ['LP', 'Album'], text: null }].map((f) => f),
    formatSummary: 'Vinyl, LP, Album',
    barcodes: s.barcode ? [s.barcode] : [],
    tracklist: (s.tracks ?? []).map(([position, title, duration]) => ({
      position,
      title,
      durationSeconds: duration
        ? duration.split(':').reduce((a, p) => a * 60 + Number(p), 0)
        : null,
      artistCredit: null,
    })),
    images: [{ kind: 'primary', url: `https://img.example/${s.id}.jpg`, width: 600, height: 600 }],
    notes: null,
    masterId: s.masterId ?? null,
    community: { have: 100, want: 50 },
    lowestPrice: s.lowestPrice != null ? { amount: s.lowestPrice, currency: 'USD' } : null,
    numForSale: 3,
  } as ExternalRelease;
}

export class FakeCatalog implements CatalogProvider, MarketValueProvider {
  readonly source = 'discogs';
  releases = new Map<string, ExternalRelease>();
  masters = new Map<string, ExternalMaster>();
  market = new Map<string, MarketValue[]>();
  calls: string[] = [];

  addRelease(spec: FakeReleaseSpec): ExternalRelease {
    const r = makeRelease(spec);
    this.releases.set(r.externalId, r);
    if (r.masterId && !this.masters.has(r.masterId)) {
      this.masters.set(r.masterId, {
        source: 'discogs',
        externalId: r.masterId,
        url: `https://www.discogs.com/master/${r.masterId}`,
        title: r.title,
        artists: r.artists,
        year: spec.masterYear ?? r.year,
        genres: r.genres,
        styles: r.styles,
        mainReleaseId: r.externalId,
        images: r.images,
      });
    }
    return r;
  }

  private toResult(r: ExternalRelease): CatalogSearchResult {
    return {
      source: 'discogs',
      type: 'release',
      externalId: r.externalId,
      masterId: r.masterId,
      title: r.title,
      artist: r.artists.map((a) => a.name).join(', '),
      year: r.year,
      country: r.country,
      labels: r.labels.map((l) => l.name),
      catalogNumber: r.labels[0]?.catalogNumber ?? null,
      formats: r.formats.flatMap((f) => [f.name, ...f.descriptions]),
      barcodes: r.barcodes,
      thumbUrl: null,
      coverUrl: r.images[0]?.url ?? null,
      community: r.community,
    };
  }

  async search(q: CatalogSearchQuery) {
    this.calls.push(`search:${JSON.stringify(q)}`);
    const n = (s?: string | null) => normalizeText(s ?? '');
    const items = [...this.releases.values()]
      .filter((r) => {
        if (q.barcode && !r.barcodes.includes(q.barcode)) return false;
        if (
          q.catalogNumber &&
          !r.labels.some(
            (l) => n(l.catalogNumber).replace(/\s/g, '') === n(q.catalogNumber).replace(/\s/g, ''),
          )
        )
          return false;
        if (q.artist && !r.artists.some((a) => n(a.name).includes(n(q.artist)))) return false;
        if (q.title && !n(r.title).includes(n(q.title))) return false;
        if (q.q && !n(`${r.artists[0]?.name} ${r.title}`).includes(n(q.q))) return false;
        return true;
      })
      .map((r) => this.toResult(r));
    return { items, page: 1, pages: 1, total: items.length };
  }

  async getRelease(id: string) {
    this.calls.push(`release:${id}`);
    const r = this.releases.get(id);
    if (!r) throw new Error(`release ${id} not found`);
    return r;
  }

  async getMaster(id: string) {
    this.calls.push(`master:${id}`);
    const m = this.masters.get(id);
    if (!m) throw new Error(`master ${id} not found`);
    return m;
  }

  async getMasterVersions(id: string) {
    const items = [...this.releases.values()]
      .filter((r) => r.masterId === id)
      .map((r) => this.toResult(r));
    return { items, page: 1, pages: 1, total: items.length };
  }

  userCollections = new Map<string, string[]>();
  /** Only visible through a user's own OAuth session. */
  privateCollections = new Map<string, string[]>();
  async listUserCollection(username: string, page = 1) {
    const ids = this.userCollections.get(username);
    if (!ids) throw new Error('not found');
    const size = 2;
    const items = ids.slice((page - 1) * size, page * size).map((externalReleaseId, i) => ({
      instanceId: `${username}-${(page - 1) * size + i}`,
      externalReleaseId,
      dateAdded: null,
    }));
    return { items, page, pages: Math.max(1, Math.ceil(ids.length / size)), total: ids.length };
  }

  lowest = new Map<string, { amount: number; currency: string } | null>();
  async getLowestListing(id: string) {
    return this.lowest.get(id) ?? null;
  }

  async getMarketValues(id: string) {
    return this.market.get(id) ?? [];
  }
}

/** OAuth connector whose per-user client can see that user's (private) collection. */
export class FakeDiscogsOAuth {
  readonly provider = 'discogs';
  private n = 0;
  constructor(
    public catalog: FakeCatalog,
    private readonly user = { id: '42', username: 'ivan_vinilos' },
  ) {}
  async requestToken(callbackUrl: string) {
    const token = `req${++this.n}`;
    return {
      token,
      secret: `${token}-secret`,
      authorizeUrl: `https://discogs.test/authorize?oauth_token=${token}&cb=${encodeURIComponent(callbackUrl)}`,
    };
  }
  async accessToken(requestToken: string, requestSecret: string, verifier: string) {
    if (requestSecret !== `${requestToken}-secret` || verifier !== 'ok')
      throw new Error('bad verifier');
    return { token: 'user-token', secret: 'user-secret' };
  }
  async identity() {
    return this.user;
  }
  /** Acting as the user: private collections are visible. */
  catalogFor(token: string) {
    if (token !== 'user-token') throw new Error('bad token');
    const c = this.catalog;
    return Object.assign(Object.create(Object.getPrototypeOf(c)), c, {
      listUserCollection: async (username: string, page = 1) => {
        const ids = c.privateCollections.get(username) ?? c.userCollections.get(username);
        if (!ids) throw new Error('not found');
        return {
          items: ids.map((externalReleaseId, i) => ({
            instanceId: `${username}-p${i}`,
            externalReleaseId,
            dateAdded: null,
          })),
          page,
          pages: 1,
          total: ids.length,
        };
      },
    }) as FakeCatalog;
  }
}

export class FakeMusicLinks implements MusicLinkProvider {
  calls = 0;
  constructor(
    readonly provider: string,
    private matches: Record<string, MusicLinkMatch | null> = {},
    private fail = false,
  ) {}
  async findTrack(q: TrackQuery) {
    this.calls++;
    if (this.fail) throw new Error('quota exceeded');
    return this.matches[q.title] ?? null;
  }
}

export class FakeRecognizer implements CoverRecognizer {
  calls = 0;
  constructor(private hints: Partial<RecognitionHints>) {}
  async extract() {
    this.calls++;
    return {
      artist: null,
      title: null,
      catalogNumber: null,
      label: null,
      barcode: null,
      country: null,
      year: null,
      confidence: 0.9,
      ...this.hints,
    };
  }
}
