import type { OAuthConnector } from '@kollektor/core';
import { HttpError, type FetchLike } from '../http/fetch-json';
import { RateLimiter } from './rate-limiter';
import { DiscogsService } from './service';

/** OAuth 1.0a Authorization header with PLAINTEXT signature, as documented by Discogs. */
export function oauthHeader(params: Record<string, string>): string {
  const all: Record<string, string> = {
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
    ...params,
  };
  return (
    'OAuth ' +
    Object.entries(all)
      .map(([k, v]) => `${k}="${k === 'oauth_signature' ? v : encodeURIComponent(v)}"`)
      .join(', ')
  );
}

/** Links a user's Discogs account: request token → authorize page → access token. */
export class DiscogsOAuthConnector implements OAuthConnector {
  readonly provider = 'discogs';
  private readonly fetchImpl: FetchLike;
  private readonly api: string;
  private readonly web: string;

  constructor(
    private readonly cfg: {
      consumerKey: string;
      consumerSecret: string;
      userAgent: string;
      currency?: string;
      fetch?: FetchLike;
      apiBase?: string;
      webBase?: string;
    },
  ) {
    this.fetchImpl = cfg.fetch ?? fetch;
    this.api = cfg.apiBase ?? 'https://api.discogs.com';
    this.web = cfg.webBase ?? 'https://www.discogs.com';
  }

  private async form(method: 'GET' | 'POST', path: string, authorization: string) {
    const res = await this.fetchImpl(`${this.api}${path}`, {
      method,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.cfg.userAgent,
      },
    });
    const text = await res.text();
    if (!res.ok)
      throw new HttpError(
        res.status,
        `Discogs OAuth ${path} failed: ${res.status} ${text.slice(0, 200)}`,
      );
    return new URLSearchParams(text);
  }

  async requestToken(callbackUrl: string) {
    const p = await this.form(
      'GET',
      '/oauth/request_token',
      oauthHeader({
        oauth_consumer_key: this.cfg.consumerKey,
        oauth_signature: `${this.cfg.consumerSecret}&`,
        oauth_callback: callbackUrl,
      }),
    );
    const token = p.get('oauth_token');
    const secret = p.get('oauth_token_secret');
    if (!token || !secret) throw new HttpError(502, 'Discogs did not return a request token');
    return {
      token,
      secret,
      authorizeUrl: `${this.web}/oauth/authorize?oauth_token=${encodeURIComponent(token)}`,
    };
  }

  async accessToken(requestToken: string, requestSecret: string, verifier: string) {
    const p = await this.form(
      'POST',
      '/oauth/access_token',
      oauthHeader({
        oauth_consumer_key: this.cfg.consumerKey,
        oauth_token: requestToken,
        oauth_verifier: verifier,
        oauth_signature: `${this.cfg.consumerSecret}&${requestSecret}`,
      }),
    );
    const token = p.get('oauth_token');
    const secret = p.get('oauth_token_secret');
    if (!token || !secret) throw new HttpError(502, 'Discogs did not return an access token');
    return { token, secret };
  }

  async identity(token: string, secret: string) {
    const res = await this.fetchImpl(`${this.api}/oauth/identity`, {
      headers: {
        Authorization: oauthHeader({
          oauth_consumer_key: this.cfg.consumerKey,
          oauth_token: token,
          oauth_signature: `${this.cfg.consumerSecret}&${secret}`,
        }),
        'User-Agent': this.cfg.userAgent,
      },
    });
    if (!res.ok) throw new HttpError(res.status, `Discogs identity failed: ${res.status}`);
    const me = (await res.json()) as { id: number; username: string };
    return { id: String(me.id), username: me.username };
  }

  catalogFor(token: string, secret: string) {
    return new DiscogsService({
      oauth: {
        consumerKey: this.cfg.consumerKey,
        consumerSecret: this.cfg.consumerSecret,
        token,
        tokenSecret: secret,
      },
      userAgent: this.cfg.userAgent,
      currency: this.cfg.currency,
      fetch: this.fetchImpl,
      limiter: new RateLimiter(),
    });
  }
}
