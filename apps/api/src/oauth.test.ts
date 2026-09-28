import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createCore } from '@kollektor/core';
import { FakeFx } from '@kollektor/core/testing';
import { createTestDb, resetDb } from '@kollektor/db/testing';
import { ConsoleEmailService } from '@kollektor/integrations';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv, type Env } from './env';

const handle = createTestDb();
const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
};
const core = createCore({ db: handle.db, fx: new FakeFx() });
const make = (env: Env) =>
  createApp({
    core,
    auth: createAuth({ db: handle.db, core, email: new ConsoleEmailService(false), env }),
    env,
  });
const app = make(
  loadEnv({ ...base, GOOGLE_CLIENT_ID: 'google-id', GOOGLE_CLIENT_SECRET: 'google-secret' }),
);
const noGoogle = make(loadEnv(base));

beforeAll(() => resetDb(handle.db));
afterAll(() => handle.close());
afterEach(() => vi.unstubAllGlobals());

const STATE = 'app-state-0123456789abcdef';
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Google's token endpoint answers with an id_token; Better Auth reads the profile from it. */
function stubGoogle(email: string) {
  const real = globalThis.fetch;
  const idToken = `${b64({ alg: 'RS256' })}.${b64({
    iss: 'https://accounts.google.com',
    aud: 'google-id',
    sub: `g-${email}`,
    email,
    email_verified: true,
    name: 'Ana Google',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.sig`;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://oauth2.googleapis.com/token'))
      return Response.json({
        access_token: 'google-access',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 3600,
      });
    return real(input, init);
  });
}

/** Keeps cookies between requests, like the auth browser session on the phone. */
function jar() {
  const cookies = new Map<string, string>();
  return {
    header: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    take(res: Response) {
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(';');
        const i = pair!.indexOf('=');
        cookies.set(pair!.slice(0, i), pair!.slice(i + 1));
      }
    },
  };
}

async function mobileGoogleLogin(email: string, redirect = 'kolektorz://auth') {
  stubGoogle(email);
  const j = jar();
  const start = await app.request(
    `/api/mobile/google?${new URLSearchParams({ state: STATE, redirect })}`,
  );
  expect(start.status).toBe(302);
  j.take(start);
  const google = new URL(start.headers.get('location')!);
  expect(google.hostname).toBe('accounts.google.com');
  expect(google.searchParams.get('redirect_uri')).toBe(
    'http://localhost:3001/api/auth/callback/google',
  );

  const callback = await app.request(
    `/api/auth/callback/google?${new URLSearchParams({ code: 'c0de', state: google.searchParams.get('state')! })}`,
    { headers: { cookie: j.header() } },
  );
  expect(callback.status).toBe(302);
  j.take(callback);
  const done = new URL(callback.headers.get('location')!);
  expect(done.pathname).toBe('/api/mobile/done');

  const handoff = await app.request(`${done.pathname}${done.search}`, {
    headers: { cookie: j.header() },
  });
  expect(handoff.status).toBe(302);
  return new URL(handoff.headers.get('location')!);
}

describe('Continuar con Google', () => {
  it('tells the clients whether Google is configured', async () => {
    expect(await (await app.request('/api/auth-options')).json()).toEqual({ google: true });
    expect(await (await noGoogle.request('/api/auth-options')).json()).toEqual({ google: false });
  });

  it('web: sign-in/social returns the Google URL for a trusted callback', async () => {
    const res = await app.request('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ provider: 'google', callbackURL: 'http://localhost:3000/' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(new URL(body.url).hostname).toBe('accounts.google.com');
  });

  it('app: the OAuth dance ends in a deep link with a usable bearer token', async () => {
    const back = await mobileGoogleLogin('ana@gmail.com');
    expect(back.protocol).toBe('kolektorz:');
    expect(back.searchParams.get('state')).toBe(STATE);
    const token = back.searchParams.get('token');
    expect(token).toBeTruthy();

    const profile = await app.request('/api/me/profile', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(profile.status).toBe(200);
    const session = await app.request('/api/auth/get-session', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe(
      'ana@gmail.com',
    );
  });

  it('app: only the app scheme may receive the session', async () => {
    for (const redirect of [
      'https://evil.example/auth',
      'javascript:alert(1)',
      'kolektorz://auth?x=1',
    ])
      expect(
        (await app.request(`/api/mobile/google?${new URLSearchParams({ state: STATE, redirect })}`))
          .status,
      ).toBe(400);
    expect(
      (
        await app.request(
          `/api/mobile/google?${new URLSearchParams({ state: 'short', redirect: 'kolektorz://auth' })}`,
        )
      ).status,
    ).toBe(400);
    const done = await app.request(
      `/api/mobile/done?${new URLSearchParams({ state: STATE, redirect: 'https://evil.example' })}`,
    );
    expect(done.status).toBe(400);
  });

  it('app: without a fresh session the handoff returns an error, never a token', async () => {
    const res = await app.request(
      `/api/mobile/done?${new URLSearchParams({ state: STATE, redirect: 'kolektorz://auth' })}`,
    );
    const back = new URL(res.headers.get('location')!);
    expect(back.searchParams.get('error')).toBe('no_session');
    expect(back.searchParams.get('token')).toBeNull();
  });

  it('app: reports when Google is not configured', async () => {
    const res = await noGoogle.request(
      `/api/mobile/google?${new URLSearchParams({ state: STATE, redirect: 'kolektorz://auth' })}`,
    );
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('not_configured');
  });
});
