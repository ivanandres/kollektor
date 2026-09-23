import { createTestDb, resetDb } from '@kollektor/db/testing';
import { createCore, type Core } from '../index';
import type { CoreDeps } from '../context';
import { createUser, FakeCatalog, FakeFx } from './index';

/** Test harness: fresh DB per test + core wired with fakes. */
export function useCore(overrides: Partial<CoreDeps> = {}) {
  const handle = createTestDb();
  const ctx = {} as { core: Core; catalog: FakeCatalog; fx: FakeFx; userId: string; deps: CoreDeps };
  const setup = async (extra: Partial<CoreDeps> = {}) => {
    await resetDb(handle.db);
    const catalog = new FakeCatalog();
    const fx = new FakeFx();
    const deps: CoreDeps = { db: handle.db, fx, catalogProvider: catalog, marketValue: catalog, ...overrides, ...extra };
    ctx.core = createCore(deps);
    ctx.catalog = catalog;
    ctx.fx = fx;
    ctx.deps = deps;
    ctx.userId = await createUser(handle.db);
    await ctx.core.profiles.ensureProfile(ctx.userId);
    return ctx;
  };
  return { ctx, setup, db: handle.db, close: handle.close };
}
