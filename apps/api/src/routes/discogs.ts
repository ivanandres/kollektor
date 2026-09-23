import { Hono } from 'hono';
import { z } from 'zod';
import { DomainError } from '@kollektor/core';
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

/** Authenticated: connect / status / disconnect the user's Discogs account. */
export function discogsAccountRoutes({ core, env }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/', async (c) => c.json(await core.accounts.discogsStatus(c.get('userId'))))
    .post('/connect', async (c) => {
      const { returnTo } = parse(
        z.object({ returnTo: z.string().max(500).optional() }),
        await jsonBody(c),
      );
      const callback = `${env.BETTER_AUTH_URL.replace(/\/$/, '')}/api/discogs/callback`;
      return c.json(
        await core.accounts.startDiscogsConnect(
          c.get('userId'),
          callback,
          safeReturnTo(env, returnTo),
        ),
      );
    })
    .delete('/', async (c) => {
      await core.accounts.disconnectDiscogs(c.get('userId'));
      return c.body(null, 204);
    });
}

/** Public: Discogs redirects the browser here after the user authorizes (or denies). */
export function discogsCallbackRoutes({ core, env }: AppDeps) {
  return new Hono().get('/callback', async (c) => {
    const token = c.req.query('oauth_token');
    const verifier = c.req.query('oauth_verifier');
    if (!token || !verifier)
      return c.redirect(withParam(safeReturnTo(env), 'discogs', 'cancelled'));
    try {
      const r = await core.accounts.completeDiscogsConnect(token, verifier);
      return c.redirect(withParam(safeReturnTo(env, r.returnTo), 'discogs', 'connected'));
    } catch (e) {
      if (!(e instanceof DomainError)) console.error(e);
      return c.redirect(withParam(safeReturnTo(env), 'discogs', 'error'));
    }
  });
}
