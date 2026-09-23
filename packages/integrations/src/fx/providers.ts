import type { FxRateProvider } from '@kollektor/core';
import { fetchJson, type FetchLike } from '../http/fetch-json';

/** ECB reference rates via Frankfurter (no key). Covers major currencies, not ARS. */
export class FrankfurterFx implements FxRateProvider {
  readonly source = 'frankfurter';
  private readonly fetchImpl: FetchLike;
  constructor(cfg: { fetch?: FetchLike; baseUrl?: string } = {}) {
    this.fetchImpl = cfg.fetch ?? fetch;
    this.baseUrl = cfg.baseUrl ?? 'https://api.frankfurter.dev/v1';
  }
  private readonly baseUrl: string;

  async getRate(base: string, quote: string, date: string): Promise<number | null> {
    try {
      const res = await fetchJson<{ rates: Record<string, number> }>(
        this.fetchImpl,
        `${this.baseUrl}/${date}?base=${base}&symbols=${quote}`,
        {},
        { retries: 1 },
      );
      return res.rates[quote] ?? null;
    } catch {
      return null;
    }
  }
}

/**
 * fawazahmed0/currency-api daily snapshots (no key, includes ARS and ~200 currencies).
 * Tries the jsDelivr CDN and then the Cloudflare mirror.
 */
export class CurrencyApiFx implements FxRateProvider {
  readonly source = 'currency-api';
  private readonly fetchImpl: FetchLike;
  constructor(cfg: { fetch?: FetchLike } = {}) {
    this.fetchImpl = cfg.fetch ?? fetch;
  }

  async getRate(base: string, quote: string, date: string): Promise<number | null> {
    const b = base.toLowerCase();
    const urls = [
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${b}.min.json`,
      `https://${date}.currency-api.pages.dev/v1/currencies/${b}.min.json`,
    ];
    for (const url of urls) {
      try {
        const res = await fetchJson<Record<string, Record<string, number> | string>>(
          this.fetchImpl,
          url,
          {},
          { retries: 0 },
        );
        const table = res[b];
        const rate = typeof table === 'object' ? table[quote.toLowerCase()] : undefined;
        if (rate != null) return rate;
      } catch {
        // try next mirror
      }
    }
    return null;
  }
}

/** First provider with an answer wins. */
export class ChainFx implements FxRateProvider {
  readonly source: string;
  constructor(private readonly providers: FxRateProvider[]) {
    this.source = providers.map((p) => p.source).join('+');
  }
  async getRate(base: string, quote: string, date: string): Promise<number | null> {
    for (const p of this.providers) {
      const r = await p.getRate(base, quote, date);
      if (r != null) return r;
    }
    return null;
  }
}
