import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  addToCollectionInput,
  addToWishlistInput,
  collectionQuery,
  wishlistQuery,
} from '@kollektor/schemas';
import { createUser, FakeRecognizer } from '../../testing';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';
import { createCore } from '../../index';
import { inferEditionType, splitFormat } from '../catalog/service';

const h = useCore();
const { ctx } = h;
beforeEach(async () => {
  await h.setup();
  seedLibrary(ctx.catalog);
});
afterAll(() => h.close());

const add = (input: Record<string, unknown>, userId = ctx.userId) =>
  ctx.core.collection.add(userId, addToCollectionInput.parse(input));
const count = async (table: string) =>
  (await h.db.execute<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM ${table}`)))[0]!.n;

describe('review regressions', () => {
  it('concurrent imports of editions of the same album do not duplicate catalog rows', async () => {
    const other = await createUser(h.db);
    await Promise.all([
      add({ discogsReleaseId: 1873013 }),
      add({ discogsReleaseId: 1873013 }, other),
      add({ discogsReleaseId: 2000001 }, other),
      add({ discogsReleaseId: 2000002 }),
    ]);
    expect(await count('albums')).toBe(2); // DSOTM + Animals
    expect(await count('releases')).toBe(3);
    expect(await count("artists WHERE name = 'Pink Floyd'")).toBe(1);
  });

  it('includePurchased=false is false', () => {
    expect(wishlistQuery.parse({ includePurchased: 'false' }).includePurchased).toBe(false);
    expect(wishlistQuery.parse({ includePurchased: 'true' }).includePurchased).toBe(true);
    expect(wishlistQuery.parse({}).includePurchased).toBe(false);
  });

  it('purchase records the edition actually bought, not the wished one', async () => {
    const w = await ctx.core.wishlist.add(
      ctx.userId,
      addToWishlistInput.parse({ discogsReleaseId: 1873013 }),
    );
    const { item } = await ctx.core.wishlist.purchase(ctx.userId, w.id, {
      discogsReleaseId: 2000001,
    });
    expect(item.release.country).toBe('Japan');
  });

  it('free-text format notes are not colors; releases without master are not "original"', () => {
    expect(
      splitFormat({ name: 'Vinyl', qty: 1, descriptions: ['LP'], text: '180 Gram' }),
    ).toMatchObject({
      color: null,
      descriptions: ['LP', '180 Gram'],
    });
    expect(
      splitFormat({ name: 'Vinyl', qty: 1, descriptions: ['LP'], text: 'Red Translucent' }).color,
    ).toBe('Red Translucent');
    expect(inferEditionType(['LP'], 1980, null)).toBeNull();
  });

  it('a release without master gets no edition type guess and no first-pressing badge', async () => {
    ctx.catalog.addRelease({ id: 'nomaster', artist: 'X', title: 'Y', year: 1990, masterId: null });
    const { item } = await add({
      discogsReleaseId: undefined,
      releaseId: await ctx.core.catalog.importFromProvider('nomaster'),
    });
    expect(item.release.editionType).toBeNull();
  });

  it('retrying a deleted add creates it again instead of failing', async () => {
    const first = await add({ discogsReleaseId: 2000002, clientRequestId: 'req-deleted-1' });
    await ctx.core.collection.remove(ctx.userId, first.item.id);
    const again = await add({ discogsReleaseId: 2000002, clientRequestId: 'req-deleted-1' });
    expect(again.replayed).toBe(false);
    expect(again.item.id).not.toBe(first.item.id);
  });

  it('PATCH validates price/currency against the stored row', async () => {
    const { item } = await add({
      discogsReleaseId: 2000002,
      purchasePrice: 10,
      purchaseCurrency: 'USD',
    });
    const { item: upd } = await ctx.core.collection.update(ctx.userId, item.id, {
      purchasePrice: 20,
    });
    expect(upd.purchasePrice).toBe(20);
    await expect(
      ctx.core.collection.update(ctx.userId, item.id, { purchaseCurrency: null }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const w = await ctx.core.wishlist.add(
      ctx.userId,
      addToWishlistInput.parse({ discogsMasterId: 10414 }),
    );
    await expect(
      ctx.core.wishlist.update(ctx.userId, w.id, { targetPrice: 30 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('jobs stuck in running are released after the lease expires', async () => {
    await ctx.core.jobs.enqueue('collection.snapshot', { userId: ctx.userId });
    await h.db.execute(
      sql`UPDATE sync_jobs SET status = 'running', updated_at = now() - interval '1 hour'`,
    );
    expect(await ctx.core.runJobs()).toMatchObject({ done: 1 });
  });

  it('a failed vision call does not consume the daily quota', async () => {
    const failing = {
      extract: async () => {
        throw new Error('upstream down');
      },
    };
    const core = createCore({ ...ctx.deps, recognizer: failing, config: { visionDailyLimit: 1 } });
    await expect(
      core.recognition.identifyByPhoto(ctx.userId, [{ data: 'A', mediaType: 'image/png' }]),
    ).rejects.toThrow('upstream down');
    const ok = createCore({
      ...ctx.deps,
      recognizer: new FakeRecognizer({ artist: 'Love' }),
      config: { visionDailyLimit: 1 },
    });
    await expect(
      ok.recognition.identifyByPhoto(ctx.userId, [{ data: 'A', mediaType: 'image/png' }]),
    ).resolves.toMatchObject({ remainingToday: 0 });
  });

  it('collection list still works after all of the above', async () => {
    await add({ discogsReleaseId: 2000003 });
    expect((await ctx.core.collection.list(ctx.userId, collectionQuery.parse({}))).total).toBe(1);
  });
});
