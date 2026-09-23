import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from '@kollektor/api-client';
import { createCore, seedAll } from '@kollektor/core';
import { FakeCatalog, FakeFx, seedLibrary } from '@kollektor/core/testing';
import { createTestDb, resetDb } from '@kollektor/db/testing';
import { ConsoleEmailService } from '@kollektor/integrations';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';

const handle = createTestDb();
const catalog = new FakeCatalog();
seedLibrary(catalog);
const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  WEB_ORIGIN: 'http://localhost:3000',
});
const core = createCore({
  db: handle.db,
  fx: new FakeFx(),
  catalogProvider: catalog,
  marketValue: catalog,
});
const app = createApp({
  core,
  auth: createAuth({ db: handle.db, core, email: new ConsoleEmailService(false), env }),
  env,
});

// Mobile-style client: bearer token kept in memory, requests routed to the in-process app.
let token: string | null = null;
const api = createApiClient({
  baseUrl: 'http://api.test/api',
  getToken: () => token,
  onToken: (t) => {
    token = t;
  },
  headers: { Origin: 'http://localhost:3000' },
  fetch: (async (url: string | URL | Request, init?: RequestInit) =>
    app.request(String(url).replace('http://api.test', ''), init)) as typeof fetch,
});

beforeAll(async () => {
  await resetDb(handle.db);
  await seedAll(handle.db);
});
afterAll(() => handle.close());

describe('@kollektor/api-client against the real app', () => {
  it('signs up, stores the token and reads typed data', async () => {
    await api.auth.signUp({
      name: 'Cliente Móvil',
      email: 'mobile@example.com',
      password: 'mobile-pass-1',
    });
    expect(token).toBeTruthy();
    const profile = await api.me.profile();
    expect(profile.username).toBe('cliente_movil');
    expect(typeof profile.createdAt).toBe('string');
  });

  it('adds with an idempotency key that survives retries', async () => {
    const key = 'form-open-0001';
    const first = await api.collection.add(
      { discogsReleaseId: 1873013, purchasePrice: 30, purchaseCurrency: 'USD' },
      key,
    );
    const retry = await api.collection.add(
      { discogsReleaseId: 1873013, purchasePrice: 30, purchaseCurrency: 'USD' },
      key,
    );
    expect(retry.replayed).toBe(true);
    expect(retry.item.id).toBe(first.item.id);
    expect(first.unlockedAchievements.map((a) => a.code)).toContain('count-1');
    const page = await api.collection.list({ country: ['UK'], sort: 'year_asc' });
    expect(page.total).toBe(1);
    const dash = await api.stats.dashboard();
    expect(dash.summary.invested).toBe(30);
  });

  it('maps errors to ApiError with Spanish messages', async () => {
    const notFound = await api.collection
      .get('00000000-0000-4000-8000-000000000000')
      .catch((e) => e);
    expect(notFound).toBeInstanceOf(ApiError);
    expect(notFound).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Disco no encontrado',
    });
    const invalid = await api.collection.add({ purchasePrice: 5 } as never).catch((e) => e);
    expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION' });
    expect(invalid.issues.length).toBeGreaterThan(0);
    const badLogin = await api.auth
      .signIn({ email: 'mobile@example.com', password: 'nope-nope-1' })
      .catch((e) => e);
    expect(badLogin).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
  });

  it('reports network failures as retryable', async () => {
    const offline = createApiClient({
      baseUrl: 'http://x/api',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    const err = await offline.stats.dashboard().catch((e) => e);
    expect(err).toMatchObject({ code: 'NETWORK', retryable: true });
  });
});
