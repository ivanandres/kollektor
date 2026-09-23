import { Hono } from 'hono';
import { z } from 'zod';
import { jsonBody, parse } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

/** Allowed post-connect destinations: the web app or the configured return URL (e.g. app deep link). */
function safeReturnTo(env: AppDeps['env'], candidate?: string | null): string {
  const fallback = env.DISCOGS_CONNECT_RETURN_URL ?? env.WEB_ORIGIN.split(',')[0]!.trim();
  if (!candidate) return fallback;
  const allowed = [
    ...env.WEB_ORIGIN.split(',').map((o) => o.trim()),
    env.DISCOGS_CONNECT_RETURN_URL,
  ].filter(Boolean) as string[];
  return allowed.some((a) => candidate === a || candidate.startsWith(a.endsWith('/') ? a : `${a}/`))
    ? candidate
    : fallback;
}

function withParam(url: string, key: string, value: string) {
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

/**
 * Authenticated: connect / complete / status / disconnect the user's Discogs account.
 * Flow: POST /connect → open authorizeUrl → Discogs → GET /api/discogs/callback → redirected to
 * returnTo with oauth_token + oauth_verifier → the signed-in app calls POST /complete.
 */
export function discogsAccountRoutes({ core, env }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/', async (c) => c.json(await core.accounts.discogsStatus(c.get('userId'))))
    .post('/connect', async (c) => {
      const { returnTo } = parse(
        z.object({ returnTo: z.string().max(500).optional() }),
        await jsonBody(c),
      );
      const to = safeReturnTo(env, returnTo);
      // Discogs appends oauth_token/oauth_verifier to this URL; return_to is re-validated there.
      const callback = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/discogs/callback?return_to=${encodeURIComponent(to)}`;
      return c.json(await core.accounts.startDiscogsConnect(c.get('userId'), callback, to));
    })
    .post('/complete', async (c) => {
      const { oauthToken, oauthVerifier } = parse(
        z.object({
          oauthToken: z.string().min(1).max(200),
          oauthVerifier: z.string().min(1).max(200),
        }),
        await jsonBody(c),
      );
      const r = await core.accounts.completeDiscogsConnect(
        c.get('userId'),
        oauthToken,
        oauthVerifier,
      );
      return c.json({ connected: true, username: r.username });
    })
    .delete('/', async (c) => {
      await core.accounts.disconnectDiscogs(c.get('userId'));
      return c.body(null, 204);
    });
}

/**
 * Public: Discogs redirects the browser here. It does NOT link anything by itself: it hands the
 * token + verifier back to the app, which completes the link with the signed-in user's session.
 */
export function discogsCallbackRoutes({ env }: AppDeps) {
  return new Hono().get('/callback', (c) => {
    const token = c.req.query('oauth_token');
    const verifier = c.req.query('oauth_verifier');
    const to = safeReturnTo(env, c.req.query('return_to'));
    if (!token || !verifier) return c.redirect(withParam(to, 'discogs', 'cancelled'));
    c.header('Referrer-Policy', 'no-referrer');
    return c.redirect(
      withParam(
        withParam(withParam(to, 'discogs', 'authorized'), 'oauth_token', token),
        'oauth_verifier',
        verifier,
      ),
    );
  });
}
