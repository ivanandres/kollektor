import { sql } from 'drizzle-orm';
import type { CoreDeps } from './context';
import { achievementService } from './modules/achievements/service';
import { catalogService } from './modules/catalog/service';
import { collectionService } from './modules/collection/service';
import { currencyService } from './modules/currency/service';
import { discoveryService } from './modules/discovery/service';
import { importService } from './modules/imports/service';
import { jobService } from './modules/jobs/service';
import { musicLinkService } from './modules/music/service';
import { profileService } from './modules/profiles/service';
import { recognitionService } from './modules/recognition/service';
import { postgresSearchProvider, type SearchProvider } from './modules/search/service';
import { statsService } from './modules/stats/service';
import { valuationService } from './modules/valuation/service';
import { wishlistService } from './modules/wishlist/service';

export * from './context';
export * from './ports';
export * from './lib/errors';
export * from './lib/normalize';
export { criteriaSchema, type Criteria } from './modules/achievements/criteria';
export type { SearchProvider, SearchResults } from './modules/search/service';
export type { ReleaseDetail, AlbumSummary } from './modules/catalog/service';
export type { CollectionItemDetail, CollectionListItem } from './modules/collection/service';

/** Wires every domain module with its dependencies. The API layer only talks to this. */
export function createCore(deps: CoreDeps, opts: { search?: SearchProvider } = {}) {
  const currency = currencyService(deps);
  const catalog = catalogService(deps);
  const valuation = valuationService(deps, currency);
  const achievements = achievementService(deps);
  const collection = collectionService(deps, catalog, valuation, {
    afterChange: (userId) => achievements.evaluate(userId),
  });
  const profiles = profileService(deps, {
    onBaseCurrencyChanged: (userId) => valuation.recomputeUser(userId),
  });
  const wishlist = wishlistService(deps, catalog, collection);
  const search = opts.search ?? postgresSearchProvider(deps);
  const stats = statsService(deps);
  const discovery = discoveryService(deps, achievements);
  const music = musicLinkService(deps, catalog);
  const recognition = recognitionService(deps);
  const jobs = jobService(deps);
  const imports = importService(deps, collection, jobs);

  /** Periodic maintenance: daily value snapshots and weekly market refresh (rate-limit friendly). */
  async function scheduleMaintenance() {
    const now = nowIso(deps);
    const users = await deps.db.execute<{ user_id: string }>(
      sql`SELECT DISTINCT user_id FROM collection_items WHERE deleted_at IS NULL`,
    );
    if (deps.marketValue) {
      const stale = await deps.db.execute<{ release_id: string }>(sql`
        SELECT DISTINCT ci.release_id FROM collection_items ci
          JOIN external_ids e ON e.entity_type = 'release' AND e.entity_id = ci.release_id AND e.source = ${deps.marketValue.source}
         WHERE ci.deleted_at IS NULL AND NOT EXISTS (
           SELECT 1 FROM price_snapshots ps WHERE ps.release_id = ci.release_id AND ps.source = ${deps.marketValue.source}
             AND ps.captured_at > now() - interval '7 days')
           AND NOT EXISTS (
             SELECT 1 FROM sync_jobs j WHERE j.type = 'release.refresh_value' AND j.status IN ('pending', 'running')
               AND j.payload->>'releaseId' = ci.release_id::text)`);
      for (const r of stale)
        await jobs.enqueue(
          'release.refresh_value',
          { releaseId: r.release_id },
          { dedupeKey: `value:${r.release_id}:${now}` },
        );
    }
    // Retry FX conversions that failed when the item was saved (provider down or offline).
    const unconverted = await deps.db.execute<{ id: string }>(sql`
      SELECT id FROM collection_items WHERE deleted_at IS NULL AND (
        (purchase_price IS NOT NULL AND purchase_price_base IS NULL)
        OR (value_override IS NOT NULL AND estimated_value_base IS NULL))`);
    for (const i of unconverted)
      await jobs.enqueue(
        'item.recompute',
        { itemId: i.id },
        { dedupeKey: `recompute:${i.id}:${now}` },
      );
    // Snapshots run after the value refreshes queued above.
    const later = new Date((deps.now ? deps.now() : new Date()).getTime() + 30 * 60_000);
    for (const u of users)
      await jobs.enqueue(
        'collection.snapshot',
        { userId: u.user_id },
        { dedupeKey: `snapshot:${u.user_id}:${now}`, runAfter: later },
      );
  }

  const jobHandlers = {
    [imports.JOB]: imports.handler,
    'item.recompute': async (p: Record<string, unknown>) =>
      valuation.recomputeItem(String(p.itemId)),
    'collection.snapshot': async (p: Record<string, unknown>) =>
      valuation.snapshotCollection(String(p.userId)),
    'release.refresh_value': async (p: Record<string, unknown>) => {
      await valuation.refreshReleaseMarketValue(String(p.releaseId));
    },
  };

  return {
    deps,
    currency,
    catalog,
    valuation,
    achievements,
    collection,
    profiles,
    wishlist,
    search,
    stats,
    discovery,
    music,
    recognition,
    jobs,
    imports,
    scheduleMaintenance,
    runJobs: (limit?: number, budgetMs?: number) => jobs.runDue(jobHandlers, limit, { budgetMs }),
  };
}

const nowIso = (deps: CoreDeps) => (deps.now ? deps.now() : new Date()).toISOString().slice(0, 10);

export type Core = ReturnType<typeof createCore>;

export { seedAll, seedAchievements, seedEssentialLists } from './seed/seed';
export { ESSENTIAL_LISTS } from './seed/essential-lists';
export { ACHIEVEMENTS } from './seed/achievements';
export { seedDemo } from './seed/demo';
