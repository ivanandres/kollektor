import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore, seedAll } from '@kollektor/core';
import {
  FakeCatalog,
  FakeFx,
  FakeMusicLinks,
  FakeRecognizer,
  seedLibrary,
} from '@kollektor/core/testing';
import { createTestDb, resetDb } from '@kollektor/db/testing';
import { ConsoleEmailService } from '@kollektor/integrations';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';

const handle = createTestDb();
const email = new ConsoleEmailService(false);
const catalog = new FakeCatalog();
seedLibrary(catalog);
const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'unused',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
  CRON_SECRET: 'cron-secret',
});
const core = createCore({
  db: handle.db,
  fx: new FakeFx(),
  catalogProvider: catalog,
  marketValue: catalog,
  musicLinks: [
    new FakeMusicLinks('spotify', {
      Money: { url: 'https://open.spotify.com/track/money', externalId: 'money', confidence: 0.9 },
    }),
  ],
  recognizer: new FakeRecognizer({ artist: 'Pink Floyd', title: 'The Dark Side of the Moon' }),
});
const app = createApp({ core, auth: createAuth({ db: handle.db, core, email, env }), env });

const ORIGIN = 'http://localhost:3000';
type Session = { cookie: string; token: string | null };

async function call(
  path: string,
  init: {
    method?: string;
    body?: unknown;
    session?: Session;
    bearer?: boolean;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = { origin: ORIGIN, ...(init.headers ?? {}) };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.session && !init.bearer) headers.cookie = init.session.cookie;
  if (init.session?.token && init.bearer) headers.authorization = `Bearer ${init.session.token}`;
  const res = await app.request(`/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
}

async function signUp(
  name: string,
  emailAddr: string,
  password = 'vinilos-1973',
): Promise<Session> {
  const r = await call('/auth/sign-up/email', {
    method: 'POST',
    body: { name, email: emailAddr, password },
  });
  expect(r.status).toBe(200);
  const cookie = (r.headers.getSetCookie?.() ?? [r.headers.get('set-cookie') ?? ''])
    .map((c) => c.split(';')[0])
    .join('; ');
  return { cookie, token: r.headers.get('set-auth-token') };
}

let ivan: Session;

beforeAll(async () => {
  await resetDb(handle.db);
  await seedAll(handle.db);
  ivan = await signUp('Iván Andrés', 'ivan@example.com');
});
afterAll(() => handle.close());

describe('auth & profile', () => {
  it('rejects anonymous requests', async () => {
    expect((await call('/collection')).status).toBe(401);
    expect((await call('/health')).json).toEqual({ ok: true });
  });

  it('creates a private profile on sign-up and lets the user edit it', async () => {
    const p = await call('/me/profile', { session: ivan });
    expect(p.json).toMatchObject({
      username: 'ivan_andres',
      profileVisibility: 'private',
      collectionVisibility: 'private',
      showPrices: false,
    });
    const upd = await call('/me/profile', {
      method: 'PATCH',
      session: ivan,
      body: { username: 'ivan', bio: 'Prog y jazz', baseCurrency: 'usd' },
    });
    expect(upd.json).toMatchObject({ username: 'ivan', bio: 'Prog y jazz', baseCurrency: 'USD' });
    expect(
      (await call('/me/profile', { method: 'PATCH', session: ivan, body: { username: 'no' } }))
        .status,
    ).toBe(400);
  });

  it('supports bearer tokens for mobile clients', async () => {
    expect(ivan.token).toBeTruthy();
    expect((await call('/me/profile', { session: ivan, bearer: true })).status).toBe(200);
  });

  it('password reset: email with link → new password works', async () => {
    const other = await signUp('Olvidadizo', 'forgot@example.com', 'old-password-1');
    void other;
    const r = await call('/auth/request-password-reset', {
      method: 'POST',
      body: { email: 'forgot@example.com', redirectTo: `${ORIGIN}/reset` },
    });
    expect(r.status).toBe(200);
    const mail = email.outbox.at(-1)!;
    expect(mail.to).toBe('forgot@example.com');
    const token = /reset-password\/([^?\s]+)/.exec(mail.text!)![1]!;
    const reset = await call('/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword: 'new-password-2' },
    });
    expect(reset.status).toBe(200);
    expect(
      (
        await call('/auth/sign-in/email', {
          method: 'POST',
          body: { email: 'forgot@example.com', password: 'old-password-1' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call('/auth/sign-in/email', {
          method: 'POST',
          body: { email: 'forgot@example.com', password: 'new-password-2' },
        })
      ).status,
    ).toBe(200);
  });
});

describe('MVP flow', () => {
  let itemId = '';

  it('finds an edition (search / photo / barcode) and adds it with the price paid', async () => {
    const search = await call('/catalog/external/search?artist=pink%20floyd&title=dark%20side', {
      session: ivan,
    });
    expect(search.status).toBe(200);
    expect(search.json.attribution).toBe('Datos provistos por Discogs');
    expect(search.json.items.map((i: { country: string }) => i.country).sort()).toEqual([
      'Japan',
      'UK',
    ]);

    const photo = await call('/catalog/identify/photo', {
      method: 'POST',
      session: ivan,
      body: { images: [{ data: 'data:image/jpeg;base64,AAAA', mediaType: 'image/jpeg' }] },
    });
    expect(photo.status).toBe(200);
    expect(photo.json.candidates.length).toBeGreaterThanOrEqual(2);
    expect(photo.json.remainingToday).toBe(29);

    const versions = await call('/catalog/external/masters/10362/versions', { session: ivan });
    expect(versions.json.items).toHaveLength(2);

    const added = await call('/collection', {
      method: 'POST',
      session: ivan,
      body: {
        discogsReleaseId: 1873013,
        purchasePrice: 35,
        purchaseCurrency: 'USD',
        purchaseDate: '2026-09-20',
        conditionMedia: 'VG+',
        purchasePlace: 'Disquería del centro',
      },
    });
    expect(added.status).toBe(201);
    expect(added.json.unlockedAchievements.map((a: { code: string }) => a.code)).toContain(
      'count-1',
    );
    expect(added.json.item.value).toMatchObject({ paid: 35, estimated: 300, difference: 265 });
    itemId = added.json.item.id;
  });

  it('shows the full record with tracklist and verified listening links', async () => {
    const item = await call(`/collection/${itemId}`, { session: ivan });
    expect(item.json.release.album).toMatchObject({
      title: 'The Dark Side Of The Moon',
      artistDisplay: 'Pink Floyd',
    });
    expect(item.json.release.labels[0]).toMatchObject({
      name: 'Harvest',
      catalogNumber: 'SHVL 804',
    });
    const money = item.json.release.tracks.find((t: { title: string }) => t.title === 'Money');
    expect(money.position).toBe('B1');
    const links = await call(`/catalog/tracks/${money.id}/links`, { session: ivan });
    expect(links.json.links.spotify).toMatchObject({
      status: 'found',
      url: 'https://open.spotify.com/track/money',
    });
    const breathe = item.json.release.tracks.find((t: { title: string }) => t.title === 'Breathe');
    expect(
      (await call(`/catalog/tracks/${breathe.id}/links`, { session: ivan })).json.links.spotify,
    ).toEqual({ status: 'not_found', message: 'No encontramos este tema.' });
  });

  it('searches and filters the collection', async () => {
    await call('/collection', {
      method: 'POST',
      session: ivan,
      body: { discogsReleaseId: 2000006, purchasePrice: 40000, purchaseCurrency: 'ARS' },
    });
    await call('/collection', {
      method: 'POST',
      session: ivan,
      body: { discogsReleaseId: 2000007 },
    });
    const s = await call('/search?q=money', { session: ivan });
    expect(s.json.tracks[0]).toMatchObject({ title: 'Money', collectionItemId: itemId });
    const f = await call('/collection?genre=Jazz&country=Japan&decade=1950', { session: ivan });
    expect(f.json.items.map((i: { title: string }) => i.title)).toEqual(['Kind Of Blue']);
    const multi = await call('/collection?country=UK&country=Japan&sort=year_asc', {
      session: ivan,
    });
    expect(multi.json.total).toBe(3);
    expect((await call('/collection?decade=abc', { session: ivan })).status).toBe(400);
    const facets = await call('/collection/facets', { session: ivan });
    expect(facets.json.countries.map((x: { value: string }) => x.value).sort()).toEqual([
      'Japan',
      'UK',
    ]);
  });

  it('wishlist → purchase → collection', async () => {
    const w = await call('/wishlist', {
      method: 'POST',
      session: ivan,
      body: { discogsMasterId: 10414, priority: 1, targetPrice: 45, targetCurrency: 'USD' },
    });
    expect(w.status).toBe(201);
    const bought = await call(`/wishlist/${w.json.id}/purchase`, {
      method: 'POST',
      session: ivan,
      body: { discogsReleaseId: 2000002, purchasePrice: 42, purchaseCurrency: 'USD' },
    });
    expect(bought.status).toBe(201);
    expect((await call('/wishlist', { session: ivan })).json).toHaveLength(0);
    expect((await call('/wishlist?includePurchased=true', { session: ivan })).json[0].status).toBe(
      'purchased',
    );
  });

  it('dashboard, achievements and discovery', async () => {
    const d = await call('/dashboard', { session: ivan });
    expect(d.json.summary).toMatchObject({ items: 4, invested: 117, currency: 'USD' });
    expect(d.json.highlights.topArtist.label).toBe('Pink Floyd');
    const a = await call('/achievements', { session: ivan });
    expect(a.json.find((x: { code: string }) => x.code === 'japanese-edition').unlocked).toBe(true);
    const disc = await call('/discover', { session: ivan });
    expect(
      disc.json.some(
        (i: { message: string }) =>
          i.message === 'Tenés 2 de los 8 discos esenciales de Pink Floyd.',
      ),
    ).toBe(true);
  });

  it('isolates users and never leaks one collection to another', async () => {
    const eve = await signUp('Eve', 'eve@example.com');
    expect((await call(`/collection/${itemId}`, { session: eve })).status).toBe(404);
    expect((await call(`/collection/${itemId}`, { method: 'DELETE', session: eve })).status).toBe(
      404,
    );
    expect((await call('/collection', { session: eve })).json.total).toBe(0);
    expect((await call('/search?q=pink', { session: eve })).json.artists).toEqual([]);
  });

  it('protects the cron endpoint', async () => {
    expect((await call('/cron/maintenance')).status).toBe(401);
    const ok = await call('/cron/maintenance', {
      headers: { authorization: 'Bearer cron-secret' },
    });
    expect(ok.status).toBe(200);
  });

  it('Idempotency-Key makes adds safe to retry', async () => {
    const body = { discogsReleaseId: 2000003 };
    const headers = { 'idempotency-key': 'mobile-retry-0001' };
    const a = await call('/collection', { method: 'POST', session: ivan, body, headers });
    const b = await call('/collection', { method: 'POST', session: ivan, body, headers });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.json.item.id).toBe(a.json.item.id);
  });

  it('validation errors are structured', async () => {
    const r = await call('/collection', {
      method: 'POST',
      session: ivan,
      body: { purchasePrice: 10 },
    });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe('VALIDATION');
  });
});
