import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore, seedAll } from '@kollektor/core';
import { FakeCatalog, FakeFx } from '@kollektor/core/testing';
import { createTestDb, resetDb } from '@kollektor/db/testing';
import { ConsoleEmailService } from '@kollektor/integrations';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv, type Env } from './env';

const handle = createTestDb();
const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'x',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
  WEB_ORIGIN: 'http://localhost:3000',
};
const core = createCore({ db: handle.db, fx: new FakeFx(), catalogProvider: new FakeCatalog() });
let app: ReturnType<typeof createApp>;
let adminCookie = '';
let userCookie = '';

async function signUp(a: ReturnType<typeof createApp>, email: string) {
  const r = await a.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ name: email.split('@')[0], email, password: 'admin-pass-123' }),
  });
  const body = (await r.json()) as { user: { id: string } };
  return {
    id: body.user.id,
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; '),
  };
}

beforeAll(async () => {
  await resetDb(handle.db);
  await seedAll(handle.db);
  const env0 = loadEnv(base);
  const bootstrapApp = createApp({
    core,
    auth: createAuth({ db: handle.db, core, email: new ConsoleEmailService(false), env: env0 }),
    env: env0,
  });
  const admin = await signUp(bootstrapApp, 'curator@example.com');
  const user = await signUp(bootstrapApp, 'user@example.com');
  const env: Env = loadEnv({ ...base, ADMIN_USER_IDS: admin.id });
  app = createApp({
    core,
    auth: createAuth({ db: handle.db, core, email: new ConsoleEmailService(false), env }),
    env,
  });
  adminCookie = admin.cookie;
  userCookie = user.cookie;
});
afterAll(() => handle.close());

const req = (path: string, cookie: string, method = 'GET', body?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: {
      cookie,
      origin: 'http://localhost:3000',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

describe('admin curation', () => {
  it('is forbidden for regular users', async () => {
    expect((await req('/admin/essential-lists', userCookie)).status).toBe(403);
  });

  it('creates an essential list with its achievement, edits achievements, deletes lists', async () => {
    const put = await req('/admin/essential-lists/spinetta', adminCookie, 'PUT', {
      artist: 'Luis Alberto Spinetta',
      name: 'Spinetta — esenciales',
      albums: [
        { title: 'Artaud', year: 1973 },
        { title: 'Kamikaze', year: 1982 },
      ],
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { albums: unknown[] }).albums).toHaveLength(2);
    const achievements = (await (await req('/admin/achievements', adminCookie)).json()) as {
      code: string;
      isActive: boolean;
    }[];
    expect(achievements.find((a) => a.code === 'complete-spinetta')?.isActive).toBe(true);

    const patched = await req('/admin/achievements/count-500', adminCookie, 'PATCH', {
      name: 'Medio millar',
      isActive: false,
    });
    expect(await patched.json()).toMatchObject({ name: 'Medio millar', isActive: false });
    expect(
      (
        await req('/admin/achievements/count-500', adminCookie, 'PATCH', {
          criteria: { type: 'nope' },
        })
      ).status,
    ).toBe(400);

    // Editing a *curated* list (from the repo seed) also survives re-seeding, and a list PUT
    // doesn't revert earlier achievement edits.
    await req('/admin/essential-lists/radiohead', adminCookie, 'PUT', {
      artist: 'Radiohead',
      name: 'Radiohead — mi selección',
      albums: [{ title: 'OK Computer', year: 1997 }],
    });
    await seedAll(handle.db);
    const rh = (
      (await (await req('/admin/essential-lists', adminCookie)).json()) as {
        code: string;
        name: string;
        albums: unknown[];
      }[]
    ).find((l) => l.code === 'radiohead');
    expect(rh).toMatchObject({ name: 'Radiohead — mi selección' });
    expect(rh!.albums).toHaveLength(1);
    const kept = (await (await req('/admin/achievements', adminCookie)).json()) as {
      code: string;
      name: string;
    }[];
    expect(kept.find((a) => a.code === 'count-500')?.name).toBe('Medio millar');

    // Re-seeding on deploy keeps admin edits: the admin list stays, the deactivated badge stays off.
    await seedAll(handle.db);
    const lists = (await (await req('/admin/essential-lists', adminCookie)).json()) as {
      code: string;
    }[];
    expect(lists.some((l) => l.code === 'spinetta')).toBe(true);
    const reseeded = (await (await req('/admin/achievements', adminCookie)).json()) as {
      code: string;
      isActive: boolean;
    }[];
    expect(reseeded.find((a) => a.code === 'count-500')?.isActive).toBe(false);

    expect((await req('/admin/essential-lists/spinetta', adminCookie, 'DELETE')).status).toBe(204);
    const after = (await (await req('/admin/achievements', adminCookie)).json()) as {
      code: string;
      isActive: boolean;
    }[];
    expect(after.find((a) => a.code === 'complete-spinetta')?.isActive).toBe(false);
  });
});
