import type {
  CatalogProvider,
  CatalogSearchResult,
  ExternalMaster,
  ExternalRelease,
  MarketValue,
  MarketValueProvider,
  Paginated,
} from '@kollektor/core';
import type { CatalogSearchQuery } from '@kollektor/schemas';
import { fetchJson, HttpError, type FetchLike } from '../http/fetch-json';
import {
  mapMaster,
  mapPriceSuggestions,
  mapRelease,
  mapSearchResult,
  mapVersion,
  splitTitle,
} from './mapper';
import { RateLimiter } from './rate-limiter';
import type {
  DMarketStats,
  DMaster,
  DPriceSuggestions,
  DRelease,
  DSearchResponse,
  DVersionsResponse,
} from './types';

export interface DiscogsConfig {
  /** Personal access token (app-level). Required for search. */
  token: string;
  /** Discogs requires a unique, descriptive User-Agent. */
  userAgent: string;
  currency?: string;
  baseUrl?: string;
  fetch?: FetchLike;
  limiter?: RateLimiter;
}

/**
 * Adapter for the Discogs API v2. Implements the catalog and market-value ports;
 * nothing outside this folder knows about Discogs response shapes.
 * Data attribution ("Datos provistos por Discogs") must be shown wherever this data is displayed.
 */
export class DiscogsService implements CatalogProvider, MarketValueProvider {
  readonly source = 'discogs';
  private readonly base: string;
  private readonly fetchImpl: FetchLike;
  private readonly limiter: RateLimiter;
  private readonly currency: string;

  constructor(private readonly cfg: DiscogsConfig) {
    this.base = cfg.baseUrl ?? 'https://api.discogs.com';
    this.fetchImpl = cfg.fetch ?? fetch;
    this.limiter = cfg.limiter ?? new RateLimiter();
    this.currency = cfg.currency ?? 'USD';
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(path, this.base);
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    await this.limiter.acquire();
    return fetchJson<T>(
      this.fetchImpl,
      url.toString(),
      {
        headers: {
          Authorization: `Discogs token=${this.cfg.token}`,
          'User-Agent': this.cfg.userAgent,
          Accept: 'application/vnd.discogs.v2.discogs+json',
        },
      },
      {
        onResponse: (res) => {
          const remaining = res.headers.get('x-discogs-ratelimit-remaining');
          this.limiter.observe(remaining == null ? null : Number(remaining));
        },
      },
    );
  }

  async search(q: CatalogSearchQuery): Promise<Paginated<CatalogSearchResult>> {
    const res = await this.get<DSearchResponse>('/database/search', {
      type: q.type,
      q: q.q,
      artist: q.artist,
      release_title: q.title,
      catno: q.catalogNumber,
      barcode: q.barcode?.replace(/\D/g, ''),
      country: q.country,
      year: q.year,
      format: q.format,
      page: q.page,
      per_page: q.perPage,
    });
    return {
      items: res.results
        .filter((r) => r.type === 'release' || r.type === 'master')
        .map(mapSearchResult),
      page: res.pagination.page,
      pages: res.pagination.pages,
      total: res.pagination.items,
    };
  }

  async getRelease(externalId: string): Promise<ExternalRelease> {
    return mapRelease(
      await this.get<DRelease>(`/releases/${encodeURIComponent(externalId)}`, {
        curr_abbr: this.currency,
      }),
      this.currency,
    );
  }

  async getMaster(externalId: string): Promise<ExternalMaster> {
    return mapMaster(await this.get<DMaster>(`/masters/${encodeURIComponent(externalId)}`));
  }

  async getMasterVersions(externalId: string, page = 1): Promise<Paginated<CatalogSearchResult>> {
    const [master, res] = await Promise.all([
      this.getMaster(externalId),
      this.get<DVersionsResponse>(`/masters/${encodeURIComponent(externalId)}/versions`, {
        page,
        per_page: 50,
      }),
    ]);
    const artist = master.artists.map((a) => a.name).join(', ') || splitTitle(master.title).artist;
    return {
      items: res.versions.map((v) => ({ ...mapVersion(v, { artist }), masterId: externalId })),
      page: res.pagination.page,
      pages: res.pagination.pages,
      total: res.pagination.items,
    };
  }

  /**
   * Price suggestions per condition require the token's account to have seller settings;
   * if unavailable we fall back to the marketplace's lowest listing (clearly a weaker signal).
   */
  async getMarketValues(externalReleaseId: string): Promise<MarketValue[]> {
    const id = encodeURIComponent(externalReleaseId);
    try {
      const suggestions = mapPriceSuggestions(
        await this.get<DPriceSuggestions>(`/marketplace/price_suggestions/${id}`),
      );
      if (suggestions.length) return suggestions;
    } catch (e) {
      if (!(e instanceof HttpError) || ![401, 403, 404].includes(e.status)) throw e;
    }
    const stats = await this.get<DMarketStats>(`/marketplace/stats/${id}`, {
      curr_abbr: this.currency,
    });
    return stats.lowest_price?.value != null
      ? [
          {
            kind: 'lowest',
            condition: null,
            amount: stats.lowest_price.value,
            currency: stats.lowest_price.currency,
          },
        ]
      : [];
  }
}
