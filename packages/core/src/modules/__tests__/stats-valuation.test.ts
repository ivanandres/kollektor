import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addToCollectionInput } from '@kollektor/schemas';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';
import { pickSnapshot } from '../valuation/service';

let now = new Date('2026-09-01T12:00:00Z');
const h = useCore({ now: () => now });
const { ctx } = h;
beforeEach(async () => {
  now = new Date('2026-09-01T12:00:00Z');
  await h.setup();
  seedLibrary(ctx.catalog);
});
afterAll(() => h.close());

const add = (input: Record<string, unknown>) => ctx.core.collection.add(ctx.userId, addToCollectionInput.parse(input));

describe('stats', () => {
  it('dashboard: totals, investment vs estimated value and highlights', async () => {
    await add({ discogsReleaseId: 1873013, purchasePrice: 100, purchaseCurrency: 'USD', purchaseDate: '2025-03-10' }); // value 300
    await add({ discogsReleaseId: 2000002, purchasePrice: 30000, purchaseCurrency: 'ARS', purchaseDate: '2026-01-05' }); // 30 USD
    await add({ discogsReleaseId: 2000006, purchasePrice: 50, purchaseCurrency: 'EUR', purchaseDate: '2026-01-20', valueOverride: 70, valueOverrideCurrency: 'USD' });
    await add({ discogsReleaseId: 2000003 });

    const d = await ctx.core.stats.dashboard(ctx.userId);
    expect(d.summary).toMatchObject({ items: 4, artists: 3, albums: 4, releases: 4, invested: 185, estimated: 370, difference: 185, currency: 'USD' });
    expect(d.highlights.topArtist).toMatchObject({ label: 'Pink Floyd', count: 2 });
    expect(d.highlights.oldestEdition?.title).toBe('Kind Of Blue');
    expect(d.highlights.mostValuable?.title).toBe('The Dark Side Of The Moon');
    expect(d.highlights.biggestPurchase?.title).toBe('The Dark Side Of The Moon');
    expect(d.charts.byDecade.map((b) => b.label)).toEqual(['1950s', '1960s', '1970s']);
    expect(d.charts.byCountry[0]).toMatchObject({ key: 'UK', count: 2 });

    const t = await ctx.core.stats.timeline(ctx.userId);
    expect(t.spendPerYear).toEqual([
      { year: 2025, total: 100, purchases: 1, average: 100 },
      { year: 2026, total: 85, purchases: 2, average: 42.5 },
    ]);
    expect(t.topSpendingMonth).toMatchObject({ month: '2025-03', total: 100 });
  });

  it('empty collection is all zeros, not errors', async () => {
    const d = await ctx.core.stats.dashboard(ctx.userId);
    expect(d.summary).toMatchObject({ items: 0, invested: 0, estimated: 0 });
    expect(d.highlights.latestAddition).toBeNull();
  });
});

describe('valuation', () => {
  it('prefers a suggestion for the copy condition over the lowest listing', () => {
    const base = { id: 'x', releaseId: 'r', source: 'discogs', currency: 'USD', capturedAt: new Date() };
    const snaps = [
      { ...base, kind: 'lowest' as const, condition: null, price: 10 },
      { ...base, kind: 'suggestion' as const, condition: 'VG+' as const, price: 25 },
      { ...base, kind: 'suggestion' as const, condition: 'NM' as const, price: 40 },
    ];
    expect(pickSnapshot(snaps, 'NM')?.price).toBe(40);
    expect(pickSnapshot(snaps, 'G')?.price).toBe(25);
    expect(pickSnapshot(snaps.slice(0, 1), 'NM')?.price).toBe(10);
  });

  it('refreshes market values through jobs and keeps a value history', async () => {
    await add({ discogsReleaseId: 1873013, conditionMedia: 'NM', purchasePrice: 100, purchaseCurrency: 'USD' });
    ctx.catalog.market.set('1873013', [
      { kind: 'suggestion', condition: 'NM', amount: 420, currency: 'USD' },
      { kind: 'suggestion', condition: 'VG+', amount: 250, currency: 'USD' },
    ]);
    await ctx.core.scheduleMaintenance();
    expect(await ctx.core.runJobs()).toMatchObject({ done: 1, failed: 0 }); // value refresh
    now = new Date('2026-09-01T12:31:00Z');
    expect(await ctx.core.runJobs()).toMatchObject({ done: 1, failed: 0 }); // snapshot
    const [item] = (await ctx.core.collection.list(ctx.userId, { sort: 'added_desc', page: 1, pageSize: 10 })).items;
    expect(item?.estimatedValueBase).toBe(420);

    // Re-scheduling the same day doesn't duplicate work
    await ctx.core.scheduleMaintenance();
    expect(await ctx.core.runJobs()).toMatchObject({ done: 0 });

    now = new Date('2026-09-02T12:00:00Z');
    await ctx.core.valuation.snapshotCollection(ctx.userId);
    const t = await ctx.core.stats.timeline(ctx.userId);
    expect(t.valueHistory.map((v) => [v.date, v.estimated])).toEqual([
      ['2026-09-01', 420],
      ['2026-09-02', 420],
    ]);
  });

  it('recomputes base amounts when the user changes base currency', async () => {
    await add({ discogsReleaseId: 1873013, purchasePrice: 100, purchaseCurrency: 'USD' });
    await ctx.core.profiles.updateProfile(ctx.userId, { baseCurrency: 'ARS' });
    const s = await ctx.core.stats.summary(ctx.userId);
    expect(s).toMatchObject({ currency: 'ARS', invested: 100_000, estimated: 300_000 });
  });

  it('retries failed currency conversions from the maintenance job', async () => {
    const saved = ctx.fx['rates'];
    ctx.fx['rates'] = {};
    const { item } = await add({ discogsReleaseId: 2000002, purchasePrice: 20000, purchaseCurrency: 'ARS', purchaseDate: '2026-08-15' });
    expect(item.value.paid).toBeNull();
    ctx.fx['rates'] = saved;
    await ctx.core.scheduleMaintenance();
    await ctx.core.runJobs();
    expect((await ctx.core.collection.get(ctx.userId, item.id)).value.paid).toBe(20);
  });

  it('caches FX rates and falls back to the last known rate when the provider fails', async () => {
    const r1 = await ctx.core.currency.convert(10_000, 'ARS', 'USD', '2026-08-01');
    expect(r1).toBe(10);
    const calls = ctx.fx.calls;
    await ctx.core.currency.convert(5_000, 'ARS', 'USD', '2026-08-01');
    expect(ctx.fx.calls).toBe(calls);
    // No rate for this pair from the provider → uses the latest cached one before the date
    ctx.fx['rates'] = {};
    expect(await ctx.core.currency.convert(1_000, 'ARS', 'USD', '2026-08-20')).toBe(1);
    expect(await ctx.core.currency.convert(1, 'GBP', 'USD')).toBeNull();
  });
});
