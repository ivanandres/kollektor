import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addToCollectionInput, addToWishlistInput } from '@kollektor/schemas';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';

const h = useCore();
const { ctx } = h;
beforeEach(async () => {
  await h.setup();
  seedLibrary(ctx.catalog);
});
afterAll(() => h.close());

const add = (input: Record<string, unknown>) => ctx.core.wishlist.add(ctx.userId, addToWishlistInput.parse(input));

describe('wishlist', () => {
  it('adds any edition of an album (Discogs master) or a specific edition', async () => {
    const any = await add({ discogsMasterId: 10414, priority: 1, targetPrice: 40, targetCurrency: 'USD' });
    expect(any).toMatchObject({ release: null, priority: 1, status: 'wanted', targetPrice: 40 });
    expect(any.album.title).toBe('Animals');
    const specific = await add({ discogsReleaseId: 2000001, notes: 'La japonesa con obi' });
    expect(specific.release).toMatchObject({ country: 'Japan', catalogNumbers: ['EMS-80324'] });
  });

  it('rejects duplicates and flags albums already owned in another edition', async () => {
    await ctx.core.collection.add(ctx.userId, addToCollectionInput.parse({ discogsReleaseId: 1873013 }));
    const w = await add({ discogsReleaseId: 2000001 });
    expect(w.ownedEditions).toBe(1);
    await expect(add({ discogsReleaseId: 2000001 })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('moves through statuses and converts to a collection item on purchase', async () => {
    const w = await add({ discogsMasterId: 10362 });
    await ctx.core.wishlist.update(ctx.userId, w.id, { status: 'searching' });
    await ctx.core.wishlist.update(ctx.userId, w.id, { status: 'found' });
    await expect(ctx.core.wishlist.update(ctx.userId, w.id, { status: 'purchased' })).rejects.toMatchObject({ code: 'VALIDATION' });

    // Bought the Japanese pressing of the album on the wishlist
    const { item } = await ctx.core.wishlist.purchase(ctx.userId, w.id, {
      discogsReleaseId: 2000001, purchasePrice: 60, purchaseCurrency: 'USD', conditionMedia: 'NM',
    });
    expect(item.release.country).toBe('Japan');
    expect(item.value.paid).toBe(60);
    expect(await ctx.core.wishlist.list(ctx.userId)).toHaveLength(0);
    const history = await ctx.core.wishlist.list(ctx.userId, { includePurchased: true });
    expect(history[0]).toMatchObject({ status: 'purchased', collectionItemId: item.id });
  });

  it('refuses to purchase an edition of a different album', async () => {
    const w = await add({ discogsMasterId: 10414 });
    await expect(ctx.core.wishlist.purchase(ctx.userId, w.id, { discogsReleaseId: 1873013 })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
