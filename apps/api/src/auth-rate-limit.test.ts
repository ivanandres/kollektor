import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore } from '@kollektor/core';
import { FakeFx } from '@kollektor/core/testing';
import { createTestDb, resetDb } from '@kollektor/db/testing';
import { ConsoleEmailService } from '@kollektor/integrations';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnv } from './env';

const handle = createTestDb();
// Production mode turns on Better Auth's (database-backed) rate limiting.
const env = loadEnv({
  NODE_ENV: 'production',
  DATABASE_URL: 'unused',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-0123',
  BETTER_AUTH_URL: 'http://localhost:3001',
  WEB_ORIGIN: 'http://localhost:3000',
});
const core = createCore({ db: handle.db, fx: new FakeFx() });
const app = createApp({
  core,
  auth: createAuth({ db: handle.db, core, email: new ConsoleEmailService(false), env }),
  env,
});

beforeAll(() => resetDb(handle.db));
afterAll(() => handle.close());

describe('auth rate limiting', () => {
  it('blocks brute force on sign-in after 5 attempts per minute (shared via Postgres)', async () => {
    const attempt = () =>
      app.request('/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
          'x-forwarded-for': '203.0.113.7',
        },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    const [row] = await handle.client`SELECT count(*)::int AS n FROM rate_limit`;
    expect(row!.n).toBeGreaterThan(0);
  });
});
