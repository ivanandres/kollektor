import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { toIsoDate } from '../../lib/dates';
import { DomainError, notFound } from '../../lib/errors';
import type { CurrencyService } from '../currency/service';

const { collectionItems, priceSnapshots, profiles, externalIds, collectionValueSnapshots } = schema;

type Grade = (typeof schema.grade.enumValues)[number];
type Snapshot = typeof priceSnapshots.$inferSelect;

export interface ValueEstimate {
  amount: number;
  currency: string;
  source: string;
  kind: 'manual' | 'suggestion' | 'median' | 'lowest';
  capturedAt: Date | null;
}

/**
 * Picks the best available market estimate for a copy:
 * suggestion for the copy's media condition > median > any suggestion > lowest listing.
 */
export function pickSnapshot(snapshots: Snapshot[], condition: Grade | null): Snapshot | null {
  const latest = (pred: (s: Snapshot) => boolean) =>
    snapshots.filter(pred).sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0] ??
    null;
  return (
    (condition ? latest((s) => s.kind === 'suggestion' && s.condition === condition) : null) ??
    latest((s) => s.kind === 'median') ??
    latest((s) => s.kind === 'suggestion' && s.condition === 'VG+') ??
    latest((s) => s.kind === 'suggestion') ??
    latest((s) => s.kind === 'lowest')
  );
}

export function valuationService(deps: CoreDeps, currency: CurrencyService) {
  const { db } = deps;

  async function baseCurrencyOf(userId: string): Promise<string> {
    const [p] = await db
      .select({ c: profiles.baseCurrency })
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return p?.c ?? 'USD';
  }

  async function estimate(
    item: typeof collectionItems.$inferSelect,
  ): Promise<ValueEstimate | null> {
    if (item.valueOverride != null && item.valueOverrideCurrency) {
      return {
        amount: item.valueOverride,
        currency: item.valueOverrideCurrency,
        source: 'manual',
        kind: 'manual',
        capturedAt: item.updatedAt,
      };
    }
    const snaps = await db
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.releaseId, item.releaseId))
      .orderBy(desc(priceSnapshots.capturedAt))
      .limit(50);
    const best = pickSnapshot(snaps, item.conditionMedia);
    if (!best) return null;
    return {
      amount: best.price,
      currency: best.currency,
      source: best.source,
      kind: best.kind === 'manual' ? 'manual' : best.kind,
      capturedAt: best.capturedAt,
    };
  }

  /** Recomputes the denormalized estimate (and base purchase price) of one item. */
  async function recomputeItem(itemId: string): Promise<void> {
    const [item] = await db.select().from(collectionItems).where(eq(collectionItems.id, itemId));
    if (!item) return;
    const base = await baseCurrencyOf(item.userId);
    const est = await estimate(item);
    const estimatedValueBase = est ? await currency.convert(est.amount, est.currency, base) : null;
    const purchasePriceBase =
      item.purchasePrice != null && item.purchaseCurrency
        ? await currency.convert(item.purchasePrice, item.purchaseCurrency, base, item.purchaseDate)
        : null;
    await db
      .update(collectionItems)
      .set({
        estimatedValueBase,
        estimatedValueSource: est ? `${est.source}:${est.kind}` : null,
        estimatedValueUpdatedAt: est ? nowOf(deps) : null,
        purchasePriceBase,
        baseCurrency: base,
      })
      .where(eq(collectionItems.id, itemId));
  }

  async function recomputeUser(userId: string): Promise<void> {
    const items = await db
      .select({ id: collectionItems.id })
      .from(collectionItems)
      .where(and(eq(collectionItems.userId, userId), isNull(collectionItems.deletedAt)));
    for (const i of items) await recomputeItem(i.id);
  }

  async function recomputeRelease(releaseId: string): Promise<void> {
    const items = await db
      .select({ id: collectionItems.id })
      .from(collectionItems)
      .where(and(eq(collectionItems.releaseId, releaseId), isNull(collectionItems.deletedAt)));
    for (const i of items) await recomputeItem(i.id);
  }

  /** Pulls fresh market data for a release from the provider and stores snapshots. */
  async function refreshReleaseMarketValue(releaseId: string): Promise<number> {
    const provider = deps.marketValue;
    if (!provider)
      throw new DomainError('NOT_CONFIGURED', 'No hay proveedor de valores de mercado');
    const [ext] = await db
      .select({ externalId: externalIds.externalId })
      .from(externalIds)
      .where(
        and(
          eq(externalIds.entityType, 'release'),
          eq(externalIds.entityId, releaseId),
          eq(externalIds.source, provider.source),
        ),
      );
    if (!ext) throw notFound('Edición vinculada a la fuente externa');
    const values = await provider.getMarketValues(ext.externalId);
    const capturedAt = nowOf(deps);
    if (values.length)
      await db.insert(priceSnapshots).values(
        values.map((v) => ({
          releaseId,
          source: provider.source,
          kind: v.kind,
          condition: v.condition,
          price: v.amount,
          currency: v.currency,
          capturedAt,
        })),
      );
    await recomputeRelease(releaseId);
    return values.length;
  }

  /** Cheapest listing for sale right now (used by wishlist price alerts). */
  async function refreshLowestListing(releaseId: string): Promise<boolean> {
    const provider = deps.marketValue;
    if (!provider?.getLowestListing) return false;
    const [ext] = await db
      .select({ externalId: externalIds.externalId })
      .from(externalIds)
      .where(
        and(
          eq(externalIds.entityType, 'release'),
          eq(externalIds.entityId, releaseId),
          eq(externalIds.source, provider.source),
        ),
      );
    if (!ext) return false;
    const lowest = await provider.getLowestListing(ext.externalId);
    if (!lowest) return false;
    await db.insert(priceSnapshots).values({
      releaseId,
      source: provider.source,
      kind: 'lowest',
      price: lowest.amount,
      currency: lowest.currency,
      capturedAt: nowOf(deps),
    });
    return true;
  }

  /** Stores today's totals for the "collection value over time" chart. */
  async function snapshotCollection(userId: string): Promise<void> {
    const base = await baseCurrencyOf(userId);
    const [t] = await db
      .select({
        count: sql<number>`count(*)::int`,
        invested: sql<number>`coalesce(sum(${collectionItems.purchasePriceBase}), 0)::float8`,
        estimated: sql<number>`coalesce(sum(${collectionItems.estimatedValueBase}), 0)::float8`,
      })
      .from(collectionItems)
      .where(and(eq(collectionItems.userId, userId), isNull(collectionItems.deletedAt)));
    const row = {
      userId,
      capturedOn: toIsoDate(nowOf(deps)),
      itemCount: t?.count ?? 0,
      totalInvested: t?.invested ?? 0,
      totalEstimated: t?.estimated ?? 0,
      currency: base,
    };
    await db
      .insert(collectionValueSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: [collectionValueSnapshots.userId, collectionValueSnapshots.capturedOn],
        set: {
          itemCount: row.itemCount,
          totalInvested: row.totalInvested,
          totalEstimated: row.totalEstimated,
          currency: base,
        },
      });
  }

  return {
    refreshLowestListing,
    estimate,
    recomputeItem,
    recomputeUser,
    recomputeRelease,
    refreshReleaseMarketValue,
    snapshotCollection,
    baseCurrencyOf,
  };
}

export type ValuationService = ReturnType<typeof valuationService>;
