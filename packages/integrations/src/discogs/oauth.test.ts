import { describe, expect, it } from 'vitest';
import { DiscogsOAuthConnector, oauthHeader } from './oauth';

function recorder(responses: Record<string, { status?: number; body: string; json?: boolean }>) {
  const calls: { url: string; method: string; auth: string }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const h = new Headers(init?.headers);
    calls.push({ url: u, method: init?.method ?? 'GET', auth: h.get('authorization') ?? '' });
    const key = Object.keys(responses).find((k) => u.includes(k))!;
    const r = responses[key]!;
    return new Response(r.body, {
      status: r.status ?? 200,
      headers: {
        'content-type': r.json ? 'application/json' : 'application/x-www-form-urlencoded',
      },
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe('Discogs OAuth', () => {
  it('builds a PLAINTEXT OAuth header', () => {
    const h = oauthHeader({
      oauth_consumer_key: 'ck',
      oauth_signature: 'cs&ts',
      oauth_callback: 'https://api.x/cb?a=1',
    });
    expect(h).toMatch(/^OAuth /);
    expect(h).toContain('oauth_signature="cs&ts"');
    expect(h).toContain('oauth_signature_method="PLAINTEXT"');
    expect(h).toContain(`oauth_callback="${encodeURIComponent('https://api.x/cb?a=1')}"`);
  });

  it('runs the three-legged flow and returns a client acting as the user', async () => {
    const r = recorder({
      '/oauth/request_token': {
        body: 'oauth_token=req&oauth_token_secret=reqsecret&oauth_callback_confirmed=true',
      },
      '/oauth/access_token': { body: 'oauth_token=acc&oauth_token_secret=accsecret' },
      '/oauth/identity': { body: JSON.stringify({ id: 42, username: 'ivan_vinilos' }), json: true },
      '/users/ivan_vinilos/collection': {
        body: JSON.stringify({ pagination: { page: 1, pages: 1, items: 0 }, releases: [] }),
        json: true,
      },
    });
    const c = new DiscogsOAuthConnector({
      consumerKey: 'ck',
      consumerSecret: 'cs',
      userAgent: 'Kollektor/test',
      fetch: r.impl,
    });
    const req = await c.requestToken('https://api.example.com/api/discogs/callback');
    expect(req).toEqual({
      token: 'req',
      secret: 'reqsecret',
      authorizeUrl: 'https://www.discogs.com/oauth/authorize?oauth_token=req',
    });
    expect(r.calls[0]!.auth).toContain('oauth_signature="cs&"');
    const acc = await c.accessToken('req', 'reqsecret', 'verif');
    expect(acc).toEqual({ token: 'acc', secret: 'accsecret' });
    expect(r.calls[1]).toMatchObject({ method: 'POST' });
    expect(r.calls[1]!.auth).toContain('oauth_verifier="verif"');
    expect(r.calls[1]!.auth).toContain('oauth_signature="cs&reqsecret"');
    expect(await c.identity('acc', 'accsecret')).toEqual({ id: '42', username: 'ivan_vinilos' });
    await c.catalogFor('acc', 'accsecret').listUserCollection('ivan_vinilos', 1);
    expect(r.calls.at(-1)!.auth).toContain('oauth_token="acc"');
    expect(r.calls.at(-1)!.auth).toContain('oauth_signature="cs&accsecret"');
  });
});
