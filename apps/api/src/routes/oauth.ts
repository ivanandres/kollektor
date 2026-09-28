import { Hono } from 'hono';
import type { AppDeps } from '../types';

/** A session this recent can be handed to the app (it was just created by the Google callback). */
const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;
const STATE = /^[A-Za-z0-9_-]{16,128}$/;

export function googleEnabled(env: AppDeps['env']) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/**
 * Deep links the app may receive the session on. `exp://` (Expo Go) only outside production:
 * any app can claim a custom scheme, so the list stays as short as possible.
 */
function allowedRedirect(env: AppDeps['env'], redirect: string | undefined) {
  if (!redirect) return null;
  let url: URL;
  try {
    url = new URL(redirect);
  } catch {
    return null;
  }
  const ok =
    url.protocol === 'kolektorz:' || (env.NODE_ENV !== 'production' && url.protocol === 'exp:');
  return ok && !url.search && !url.hash ? redirect : null;
}

function withParams(redirect: string, params: Record<string, string>) {
  return `${redirect}?${new URLSearchParams(params).toString()}`;
}

/**
 * Social login for the native app, which authenticates with a bearer token instead of cookies.
 * The app opens `GET /mobile/google?state&redirect` in an auth browser session; the OAuth dance
 * happens with cookies inside that browser, and `/mobile/done` hands the new session token to the
 * app through its deep link, together with the app's own `state` (checked by the app).
 */
export function oauthRoutes({ auth, env }: AppDeps) {
  const base = env.BETTER_AUTH_URL.replace(/\/$/, '');
  return new Hono()
    .get('/auth-options', (c) => c.json({ google: googleEnabled(env) }))
    .get('/mobile/google', async (c) => {
      const state = c.req.query('state');
      const redirect = allowedRedirect(env, c.req.query('redirect'));
      if (!redirect || !state || !STATE.test(state))
        return c.json({ error: { code: 'VALIDATION', message: 'Pedido inválido' } }, 400);
      if (!googleEnabled(env))
        return c.redirect(withParams(redirect, { state, error: 'not_configured' }));
      const done = `${base}/api/mobile/done?${new URLSearchParams({ state, redirect })}`;
      const { headers, response } = await auth.api.signInSocial({
        body: {
          provider: 'google',
          callbackURL: done,
          errorCallbackURL: done,
          disableRedirect: true,
        },
        headers: c.req.raw.headers,
        returnHeaders: true,
      });
      if (!response?.url) return c.redirect(withParams(redirect, { state, error: 'unavailable' }));
      const res = c.redirect(response.url);
      // The OAuth state cookie must live in this browser for the callback to accept it.
      for (const cookie of headers.getSetCookie()) res.headers.append('set-cookie', cookie);
      return res;
    })
    .get('/mobile/done', async (c) => {
      const state = c.req.query('state');
      const redirect = allowedRedirect(env, c.req.query('redirect'));
      if (!redirect || !state || !STATE.test(state))
        return c.json({ error: { code: 'VALIDATION', message: 'Pedido inválido' } }, 400);
      const error = c.req.query('error');
      if (error) return c.redirect(withParams(redirect, { state, error }));
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      const fresh =
        session && Date.now() - new Date(session.session.createdAt).getTime() < HANDOFF_MAX_AGE_MS;
      if (!session || !fresh)
        return c.redirect(withParams(redirect, { state, error: 'no_session' }));
      c.header('Cache-Control', 'no-store');
      return c.redirect(withParams(redirect, { state, token: session.session.token }));
    });
}
