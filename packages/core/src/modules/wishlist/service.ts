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

const { wishlistItems, releases, releaseLabels } = schema;

type WishlistStatus = (typeof schema.wishlistStatus.enumValues)[number];

export function wishlistService(
  deps: CoreDeps,
  catalog: CatalogService,
  collection: CollectionService,
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
      })
      .returning();
    await recordActivity(db, {
      userId,
      type: 'wishlist.added',
      subjectType: 'wishlist_item',
      subjectId: row!.id,
      payload: { albumId: target.albumId, releaseId: target.releaseId },
    });
    return (await list(userId, { ids: [row!.id], includePurchased: true }))[0]!;
  }

  async function update(userId: string, id: string, input: UpdateWishlistInput) {
    const current = await getOwned(userId, id);
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
    let releaseId = chosenRelease ?? w.releaseId ?? undefined;
    if (!releaseId && discogsReleaseId != null)
      releaseId = await catalog.importFromProvider(String(discogsReleaseId));
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
    return rows.map((r) => ({
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
      createdAt: r.createdAt.toISOString(),
    }));
  }

  return { add, update, remove, purchase, list };
}

export type WishlistService = ReturnType<typeof wishlistService>;
