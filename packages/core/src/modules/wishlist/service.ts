import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type {
  AddToWishlistInput,
  CollectionItemFields,
  UpdateWishlistInput,
} from '@kollektor/schemas';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { conflict, invalid, notFound } from '../../lib/errors';
import { recordActivity } from '../activity/service';
import type { CatalogService } from '../catalog/service';
import type { CollectionService } from '../collection/service';
import type { CurrencyService } from '../currency/service';

const { wishlistItems, releases, releaseLabels } = schema;

type WishlistStatus = (typeof schema.wishlistStatus.enumValues)[number];

export function wishlistService(
  deps: CoreDeps,
  catalog: CatalogService,
  collection: CollectionService,
  currency?: CurrencyService,
) {
  const { db } = deps;

  async function getOwned(userId: string, id: string) {
    const [row] = await db
      .select()
      .from(wishlistItems)
      .where(and(eq(wishlistItems.id, id), eq(wishlistItems.userId, userId)));
    if (!row) throw notFound('Ítem de wishlist');
    return row;
  }

  async function resolveTarget(
    userId: string,
    input: AddToWishlistInput,
  ): Promise<{ albumId: string; releaseId: string | null }> {
    if (input.albumId) {
      await catalog.assertAlbumVisible(userId, input.albumId);
      return { albumId: input.albumId, releaseId: null };
    }
    if (input.discogsMasterId != null)
      return {
        albumId: await catalog.importMasterFromProvider(String(input.discogsMasterId)),
        releaseId: null,
      };
    let releaseId: string;
    if (input.releaseId) {
      await catalog.assertReleaseVisible(userId, input.releaseId);
      releaseId = input.releaseId;
    } else if (input.discogsReleaseId != null) {
      releaseId = await catalog.importFromProvider(String(input.discogsReleaseId));
    } else {
      releaseId = await catalog.createManualRelease(userId, input.manual!);
    }
    return { albumId: await catalog.albumIdOfRelease(releaseId), releaseId };
  }

  async function add(userId: string, input: AddToWishlistInput) {
    if (input.clientRequestId) {
      const [prev] = await db
        .select({ id: wishlistItems.id })
        .from(wishlistItems)
        .where(
          and(
            eq(wishlistItems.userId, userId),
            eq(wishlistItems.clientRequestId, input.clientRequestId),
          ),
        );
      if (prev)
        return {
          ...(await list(userId, { ids: [prev.id], includePurchased: true }))[0]!,
          replayed: true,
        };
    }
    const target = await resolveTarget(userId, input);
    const duplicate = await db
      .select({ id: wishlistItems.id })
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.userId, userId),
          eq(wishlistItems.albumId, target.albumId),
          target.releaseId
            ? eq(wishlistItems.releaseId, target.releaseId)
            : sql`${wishlistItems.releaseId} IS NULL`,
          ne(wishlistItems.status, 'purchased'),
        ),
      );
    if (duplicate.length) throw conflict('Ya está en tu wishlist', { id: duplicate[0]!.id });
    if (input.targetPrice != null && !input.targetCurrency)
      throw invalid('La moneda es obligatoria si hay precio objetivo');
    const [row] = await db
      .insert(wishlistItems)
      .values({
        userId,
        albumId: target.albumId,
        releaseId: target.releaseId,
        targetPrice: input.targetPrice ?? null,
        targetCurrency: input.targetCurrency ?? null,
        priority: input.priority ?? 2,
        status: input.status ?? 'wanted',
        notes: input.notes ?? null,
        clientRequestId: input.clientRequestId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      // Concurrent retry with the same clientRequestId won the race.
      const [prev] = await db
        .select({ id: wishlistItems.id })
        .from(wishlistItems)
        .where(
          and(
            eq(wishlistItems.userId, userId),
            eq(wishlistItems.clientRequestId, input.clientRequestId!),
          ),
        );
      return {
        ...(await list(userId, { ids: [prev!.id], includePurchased: true }))[0]!,
        replayed: true,
      };
    }
    await recordActivity(db, {
      userId,
      type: 'wishlist.added',
      subjectType: 'wishlist_item',
      subjectId: row!.id,
      payload: { albumId: target.albumId, releaseId: target.releaseId },
    });
    return {
      ...(await list(userId, { ids: [row!.id], includePurchased: true }))[0]!,
      replayed: false,
    };
  }

  async function update(userId: string, id: string, input: UpdateWishlistInput) {
    const current = await getOwned(userId, id);
    const merged = { ...current, ...input };
    if (merged.targetPrice != null && !merged.targetCurrency)
      throw invalid('La moneda es obligatoria si hay precio objetivo');
    if (input.status === 'purchased' && !current.collectionItemId)
      throw invalid('Para marcar como comprado usá "Agregar a mi colección"');
    await db
      .update(wishlistItems)
      .set({ ...input, updatedAt: nowOf(deps) })
      .where(eq(wishlistItems.id, id));
    return (await list(userId, { ids: [id], includePurchased: true }))[0]!;
  }

  async function remove(userId: string, id: string): Promise<void> {
    await getOwned(userId, id);
    await db.delete(wishlistItems).where(eq(wishlistItems.id, id));
  }

  /**
   * "Agregar a mi colección": creates the collection item and keeps the wishlist row as
   * history (status = purchased, linked to the new item).
   */
  async function purchase(
    userId: string,
    id: string,
    input: CollectionItemFields & { releaseId?: string; discogsReleaseId?: number },
  ) {
    const w = await getOwned(userId, id);
    if (w.status === 'purchased') throw conflict('Este ítem ya fue comprado');
    const { releaseId: chosenRelease, discogsReleaseId, ...fields } = input;
    // The edition actually bought wins over the one on the wishlist.
    let releaseId = chosenRelease;
    if (!releaseId && discogsReleaseId != null)
      releaseId = await catalog.importFromProvider(String(discogsReleaseId));
    releaseId ??= w.releaseId ?? undefined;
    if (!releaseId) throw invalid('Elegí la edición que compraste');
    if ((await catalog.albumIdOfRelease(releaseId)) !== w.albumId)
      throw invalid('La edición no corresponde al álbum de la wishlist');
    const result = await collection.add(userId, { ...fields, releaseId });
    await db
      .update(wishlistItems)
      .set({
        status: 'purchased',
        collectionItemId: result.item.id,
        releaseId,
        updatedAt: nowOf(deps),
      })
      .where(eq(wishlistItems.id, id));
    await recordActivity(db, {
      userId,
      type: 'wishlist.purchased',
      subjectType: 'wishlist_item',
      subjectId: id,
      payload: { collectionItemId: result.item.id },
    });
    return result;
  }

  async function list(
    userId: string,
    opts: { status?: WishlistStatus[]; includePurchased?: boolean; ids?: string[] } = {},
  ) {
    const conds = [eq(wishlistItems.userId, userId)];
    if (opts.ids) conds.push(inArray(wishlistItems.id, opts.ids));
    if (opts.status?.length) conds.push(inArray(wishlistItems.status, opts.status));
    else if (!opts.includePurchased) conds.push(ne(wishlistItems.status, 'purchased'));
    const rows = await db
      .select()
      .from(wishlistItems)
      .where(and(...conds))
      .orderBy(asc(wishlistItems.priority), asc(wishlistItems.createdAt));
    const albums = await catalog.getAlbumSummaries([...new Set(rows.map((r) => r.albumId))]);
    const releaseIds = rows.map((r) => r.releaseId).filter((x): x is string => x != null);
    const releaseRows = releaseIds.length
      ? await db
          .select({
            id: releases.id,
            releaseYear: releases.releaseYear,
            country: releases.country,
            formatSummary: releases.formatSummary,
            editionType: releases.editionType,
            catalogNumbers: sql<
              string[]
            >`coalesce((SELECT array_agg(${releaseLabels.catalogNumber}) FROM ${releaseLabels} WHERE ${releaseLabels.releaseId} = ${releases.id}), '{}')`,
          })
          .from(releases)
          .where(inArray(releases.id, releaseIds))
      : [];
    const ownedAlbums = await db.execute<{ album_id: string; n: number }>(sql`
      SELECT r.album_id, count(*)::int AS n FROM collection_items ci JOIN releases r ON r.id = ci.release_id
       WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL GROUP BY r.album_id`);
    const owned = new Map(ownedAlbums.map((o) => [o.album_id, o.n]));
    const listings = releaseIds.length
      ? await db.execute<{
          release_id: string;
          price: string;
          currency: string;
          checked_at: Date;
        }>(sql`
          SELECT DISTINCT ON (release_id) release_id, lowest_price AS price, currency, checked_at
            FROM market_listings
           WHERE lowest_price IS NOT NULL
             AND checked_at > now() - interval '48 hours'
             AND release_id::text = ANY(ARRAY[${sql.join(
               releaseIds.map((r) => sql`${r}`),
               sql`, `,
             )}])
           ORDER BY release_id, checked_at DESC`)
      : [];
    const market = new Map(listings.map((l) => [l.release_id, l]));
    const belowTarget = async (r: (typeof rows)[number]) => {
      const m = r.releaseId ? market.get(r.releaseId) : undefined;
      if (!m || r.targetPrice == null || !r.targetCurrency || !currency) return false;
      const inTarget = await currency.convert(Number(m.price), m.currency, r.targetCurrency);
      return inTarget != null && inTarget <= r.targetPrice;
    };
    const alerts = await Promise.all(rows.map(belowTarget));
    return rows.map((r, i) => ({
      id: r.id,
      album: albums.get(r.albumId)!,
      release: releaseRows.find((x) => x.id === r.releaseId) ?? null,
      targetPrice: r.targetPrice,
      targetCurrency: r.targetCurrency,
      priority: r.priority,
      status: r.status,
      notes: r.notes,
      collectionItemId: r.collectionItemId,
      /** You already own another edition of this album. */
      ownedEditions: owned.get(r.albumId) ?? 0,
      /** Cheapest copy for sale of the wished edition (Discogs), when known. */
      market: (() => {
        const m = r.releaseId ? market.get(r.releaseId) : undefined;
        return m
          ? {
              lowest: Number(m.price),
              currency: m.currency,
              checkedAt: new Date(m.checked_at).toISOString(),
            }
          : null;
      })(),
      /** A copy is for sale at or below your target price. */
      belowTarget: alerts[i]!,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return { add, update, remove, purchase, list };
}

export type WishlistService = ReturnType<typeof wishlistService>;
