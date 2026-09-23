import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type {
  AddToCollectionInput,
  CollectionItemFields,
  CollectionQuery,
  UpdateCollectionItemInput,
} from '@kollektor/schemas';
import type { CoreDeps, Db } from '../../context';
import { nowOf } from '../../context';
import { invalid, notFound } from '../../lib/errors';
import { recordActivity } from '../activity/service';
import type { CatalogService, ReleaseDetail } from '../catalog/service';
import type { ValuationService } from '../valuation/service';
import { ARTIST_DISPLAY, COVER_URL, collectionFilters, collectionOrderBy } from './queries';

const { collectionItems, tags, collectionItemTags, collectionItemPhotos } = schema;

const MAX_PHOTOS_PER_ITEM = 10;

type ItemRow = typeof collectionItems.$inferSelect;

export interface CollectionHooks {
  /** Called after any change to a user's collection; returns newly unlocked achievement codes. */
  afterChange?: (userId: string) => Promise<string[]>;
}

export interface CollectionListItem {
  id: string;
  releaseId: string;
  albumId: string;
  title: string;
  artist: string;
  originalReleaseYear: number | null;
  releaseYear: number | null;
  country: string | null;
  formatSummary: string | null;
  editionType: string | null;
  coverImageUrl: string | null;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  purchasePrice: number | null;
  purchaseCurrency: string | null;
  purchasePriceBase: number | null;
  estimatedValueBase: number | null;
  baseCurrency: string | null;
  createdAt: string;
}

export function collectionService(
  deps: CoreDeps,
  catalog: CatalogService,
  valuation: ValuationService,
  hooks: CollectionHooks = {},
) {
  const { db } = deps;

  async function setTags(tx: Db, userId: string, itemId: string, names: string[]): Promise<void> {
    await tx.delete(collectionItemTags).where(eq(collectionItemTags.collectionItemId, itemId));
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) return;
    await tx
      .insert(tags)
      .values(unique.map((name) => ({ userId, name })))
      .onConflictDoNothing();
    const rows = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.name, unique)));
    await tx
      .insert(collectionItemTags)
      .values(rows.map((r) => ({ collectionItemId: itemId, tagId: r.id })));
  }

  function itemValues(input: CollectionItemFields & { clientRequestId?: string }) {
    const { tags: _tags, ...rest } = input;
    return rest;
  }

  async function resolveRelease(userId: string, input: AddToCollectionInput): Promise<string> {
    if (input.releaseId) {
      await catalog.assertReleaseVisible(userId, input.releaseId);
      return input.releaseId;
    }
    if (input.discogsReleaseId != null)
      return catalog.importFromProvider(String(input.discogsReleaseId));
    return catalog.createManualRelease(userId, input.manual!);
  }

  async function getOwnedRow(userId: string, itemId: string): Promise<ItemRow> {
    const [row] = await db
      .select()
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.id, itemId),
          eq(collectionItems.userId, userId),
          isNull(collectionItems.deletedAt),
        ),
      );
    if (!row) throw notFound('Disco');
    return row;
  }

  async function findByClientRequest(userId: string, clientRequestId: string) {
    const [row] = await db
      .select({ id: collectionItems.id })
      .from(collectionItems)
      .where(
        and(
          eq(collectionItems.userId, userId),
          eq(collectionItems.clientRequestId, clientRequestId),
        ),
      );
    return row?.id ?? null;
  }

  async function add(userId: string, input: AddToCollectionInput) {
    // Idempotent retry: the same clientRequestId returns the item created the first time.
    if (input.clientRequestId) {
      const existing = await findByClientRequest(userId, input.clientRequestId);
      if (existing)
        return { item: await get(userId, existing), unlockedAchievements: [], replayed: true };
    }
    const releaseId = await resolveRelease(userId, input);
    const { releaseId: _r, discogsReleaseId: _d, manual: _m, ...fields } = input;
    let itemId: string;
    try {
      itemId = await insertItem(userId, releaseId, fields);
    } catch (e) {
      const existing = input.clientRequestId
        ? await findByClientRequest(userId, input.clientRequestId)
        : null;
      if (!existing) throw e;
      return { item: await get(userId, existing), unlockedAchievements: [], replayed: true };
    }
    await valuation.recomputeItem(itemId);
    const unlocked = (await hooks.afterChange?.(userId)) ?? [];
    return { item: await get(userId, itemId), unlockedAchievements: unlocked, replayed: false };
  }

  async function insertItem(
    userId: string,
    releaseId: string,
    fields: CollectionItemFields & { clientRequestId?: string },
  ): Promise<string> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(collectionItems)
        .values({ ...itemValues(fields), userId, releaseId })
        .returning({ id: collectionItems.id });
      if (fields.tags) await setTags(tx, userId, row!.id, fields.tags);
      await recordActivity(tx, {
        userId,
        type: 'collection.added',
        subjectType: 'collection_item',
        subjectId: row!.id,
        payload: { releaseId },
      });
      return row!.id;
    });
  }

  async function update(userId: string, itemId: string, input: UpdateCollectionItemInput) {
    const current = await getOwnedRow(userId, itemId);
    const merged = { ...current, ...input };
    if (merged.purchasePrice != null && !merged.purchaseCurrency)
      throw invalid('La moneda es obligatoria si hay precio', { path: 'purchaseCurrency' });
    if (merged.valueOverride != null && !merged.valueOverrideCurrency)
      throw invalid('La moneda es obligatoria si hay valor manual', {
        path: 'valueOverrideCurrency',
      });
    await db.transaction(async (tx) => {
      const values = itemValues(input);
      if (Object.keys(values).length)
        await tx
          .update(collectionItems)
          .set({ ...values, updatedAt: nowOf(deps) })
          .where(eq(collectionItems.id, itemId));
      if (input.tags) await setTags(tx, userId, itemId, input.tags);
    });
    await valuation.recomputeItem(itemId);
    const unlocked = (await hooks.afterChange?.(userId)) ?? [];
    return { item: await get(userId, itemId), unlockedAchievements: unlocked };
  }

  /** Soft delete: keeps history for stats/activity. */
  async function remove(userId: string, itemId: string): Promise<void> {
    const row = await getOwnedRow(userId, itemId);
    await db.transaction(async (tx) => {
      await tx
        .update(collectionItems)
        // Frees the clientRequestId so a later retry can add the record again.
        .set({ deletedAt: nowOf(deps), clientRequestId: null })
        .where(eq(collectionItems.id, itemId));
      await recordActivity(tx, {
        userId,
        type: 'collection.removed',
        subjectType: 'collection_item',
        subjectId: itemId,
        payload: { releaseId: row.releaseId },
      });
    });
    await hooks.afterChange?.(userId);
  }

  async function get(userId: string, itemId: string): Promise<CollectionItemDetail> {
    const row = await getOwnedRow(userId, itemId);
    const [release, tagRows, estimate, otherCopies, photos] = await Promise.all([
      catalog.getReleaseDetail(userId, row.releaseId),
      db
        .select({ name: tags.name })
        .from(collectionItemTags)
        .innerJoin(tags, eq(tags.id, collectionItemTags.tagId))
        .where(eq(collectionItemTags.collectionItemId, itemId)),
      valuation.estimate(row),
      db
        .select({ id: collectionItems.id })
        .from(collectionItems)
        .where(
          and(
            eq(collectionItems.userId, userId),
            eq(collectionItems.releaseId, row.releaseId),
            isNull(collectionItems.deletedAt),
          ),
        ),
      db
        .select({
          id: collectionItemPhotos.id,
          url: collectionItemPhotos.url,
          caption: collectionItemPhotos.caption,
        })
        .from(collectionItemPhotos)
        .where(eq(collectionItemPhotos.collectionItemId, itemId))
        .orderBy(collectionItemPhotos.position, collectionItemPhotos.createdAt),
    ]);
    const paid = row.purchasePriceBase;
    const value = row.estimatedValueBase;
    return {
      id: row.id,
      release,
      conditionMedia: row.conditionMedia,
      conditionSleeve: row.conditionSleeve,
      copyNumber: row.copyNumber,
      isFirstPressing: row.isFirstPressing,
      purchaseDate: row.purchaseDate,
      purchasePrice: row.purchasePrice,
      purchaseCurrency: row.purchaseCurrency,
      purchasePlace: row.purchasePlace,
      storageLocation: row.storageLocation,
      notes: row.notes,
      tags: tagRows.map((t) => t.name).sort(),
      photos,
      value: {
        baseCurrency: row.baseCurrency,
        paid,
        estimated: value,
        difference: paid != null && value != null ? Math.round((value - paid) * 100) / 100 : null,
        estimate: estimate
          ? { ...estimate, capturedAt: estimate.capturedAt?.toISOString() ?? null }
          : null,
        override:
          row.valueOverride != null
            ? { amount: row.valueOverride, currency: row.valueOverrideCurrency }
            : null,
        disclaimer: 'Valor estimado: no es una tasación garantizada.',
      },
      otherCopiesCount: otherCopies.length - 1,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async function list(userId: string, q: CollectionQuery) {
    const where = collectionFilters(userId, q, nowOf(deps));
    const offset = (q.page - 1) * q.pageSize;
    const rows = await db.execute<{
      id: string;
      release_id: string;
      album_id: string;
      title: string;
      artist: string;
      original_release_year: number | null;
      release_year: number | null;
      country: string | null;
      format_summary: string | null;
      edition_type: string | null;
      cover_image_url: string | null;
      condition_media: string | null;
      condition_sleeve: string | null;
      purchase_price: string | null;
      purchase_currency: string | null;
      purchase_price_base: string | null;
      estimated_value_base: string | null;
      base_currency: string | null;
      created_at: Date;
      total: number;
    }>(sql`
      SELECT ci.id, r.id AS release_id, a.id AS album_id, a.title, ${ARTIST_DISPLAY} AS artist,
             a.original_release_year, r.release_year, r.country, r.format_summary, r.edition_type,
             ${COVER_URL} AS cover_image_url, ci.condition_media, ci.condition_sleeve,
             ci.purchase_price, ci.purchase_currency, ci.purchase_price_base, ci.estimated_value_base,
             ci.base_currency, ci.created_at, count(*) OVER ()::int AS total
        FROM collection_items ci
        JOIN releases r ON r.id = ci.release_id
        JOIN albums a ON a.id = r.album_id
       WHERE ${where}
       ORDER BY ${collectionOrderBy(q.sort)}, ci.id
       LIMIT ${q.pageSize} OFFSET ${offset}`);
    const num = (v: string | null) => (v == null ? null : Number(v));
    const items: CollectionListItem[] = rows.map((r) => ({
      id: r.id,
      releaseId: r.release_id,
      albumId: r.album_id,
      title: r.title,
      artist: r.artist,
      originalReleaseYear: r.original_release_year,
      releaseYear: r.release_year,
      country: r.country,
      formatSummary: r.format_summary,
      editionType: r.edition_type,
      coverImageUrl: r.cover_image_url,
      conditionMedia: r.condition_media,
      conditionSleeve: r.condition_sleeve,
      purchasePrice: num(r.purchase_price),
      purchaseCurrency: r.purchase_currency,
      purchasePriceBase: num(r.purchase_price_base),
      estimatedValueBase: num(r.estimated_value_base),
      baseCurrency: r.base_currency,
      createdAt: new Date(r.created_at).toISOString(),
    }));
    const total = rows[0]?.total ?? 0;
    return {
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      pages: Math.ceil(total / q.pageSize),
    };
  }

  /**
   * "¿Ya lo tengo?": for external search candidates, how many copies of that exact edition the
   * user owns, how many editions of the same album, and whether it's on their wishlist.
   */
  async function ownershipOf(
    userId: string,
    source: string,
    candidates: { type: 'release' | 'master'; externalId: string; masterId: string | null }[],
  ) {
    type Own = { ownedCopies: number; ownedEditionsOfAlbum: number; inWishlist: boolean };
    if (candidates.length === 0) return new Map<string, Own>();
    // Master results only match an album; release ids and master ids overlap numerically.
    const keys = candidates.map((c) => {
      const releaseExt = c.type === 'release' ? c.externalId : null;
      const albumKey =
        c.type === 'master'
          ? `master:${c.externalId}`
          : c.masterId
            ? `master:${c.masterId}`
            : `release:${c.externalId}`;
      return sql`(${`${c.type}:${c.externalId}`}, ${releaseExt}::text, ${albumKey})`;
    });
    const rows = await db.execute<{
      key: string;
      owned_copies: number;
      owned_album: number;
      wished: boolean;
    }>(sql`
      WITH wanted(key, release_ext, album_key) AS (VALUES ${sql.join(keys, sql`, `)}),
      rel AS (
        SELECT w.key, er.entity_id AS release_id, ea.entity_id AS album_id
          FROM wanted w
          LEFT JOIN external_ids er ON w.release_ext IS NOT NULL AND er.entity_type = 'release' AND er.source = ${source} AND er.external_id = w.release_ext
          LEFT JOIN external_ids ea ON ea.entity_type = 'album' AND ea.source = ${source} AND ea.external_id = w.album_key
      )
      SELECT rel.key,
             (SELECT count(*) FROM collection_items ci WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL AND ci.release_id = rel.release_id)::int AS owned_copies,
             (SELECT count(*) FROM collection_items ci JOIN releases r ON r.id = ci.release_id
               WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL AND r.album_id = coalesce(rel.album_id, (SELECT album_id FROM releases WHERE id = rel.release_id)))::int AS owned_album,
             EXISTS (SELECT 1 FROM wishlist_items wi WHERE wi.user_id = ${userId} AND wi.status <> 'purchased'
               AND (wi.release_id = rel.release_id OR (wi.release_id IS NULL AND wi.album_id = rel.album_id))) AS wished
        FROM rel`);
    return new Map<string, Own>(
      rows.map((r) => [
        r.key,
        { ownedCopies: r.owned_copies, ownedEditionsOfAlbum: r.owned_album, inWishlist: r.wished },
      ]),
    );
  }

  /** Every field of every record in one query (owner-only CSV export). */
  async function exportRows(userId: string) {
    return db.execute<Record<string, string | number | null>>(sql`
      SELECT ${ARTIST_DISPLAY} AS artista, a.title AS album, a.original_release_year AS año_original,
             r.release_year AS año_edicion, r.country AS pais,
             (SELECT string_agg(lb.name, ' / ' ORDER BY rl.position) FROM release_labels rl JOIN labels lb ON lb.id = rl.label_id WHERE rl.release_id = r.id) AS sello,
             (SELECT string_agg(rl.catalog_number, ' / ' ORDER BY rl.position) FROM release_labels rl WHERE rl.release_id = r.id) AS catalogo,
             r.format_summary AS formato, ci.condition_media::text AS estado_disco, ci.condition_sleeve::text AS estado_tapa,
             ci.copy_number AS numero_copia, ci.purchase_date::text AS fecha_compra, ci.purchase_price::text AS precio,
             ci.purchase_currency AS moneda, ci.purchase_price_base::text AS precio_base,
             ci.estimated_value_base::text AS valor_estimado, ci.base_currency AS moneda_base,
             ci.purchase_place AS lugar_compra, ci.storage_location AS ubicacion,
             (SELECT string_agg(tg.name, ' / ' ORDER BY tg.name) FROM collection_item_tags cit JOIN tags tg ON tg.id = cit.tag_id WHERE cit.collection_item_id = ci.id) AS tags,
             ci.notes AS notas, ci.created_at::text AS agregado
        FROM collection_items ci
        JOIN releases r ON r.id = ci.release_id
        JOIN albums a ON a.id = r.album_id
       WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL
       ORDER BY ci.created_at, ci.id`);
  }

  /** Available filter values with counts over the whole (non-deleted) collection. */
  async function facets(userId: string) {
    const from = sql`FROM collection_items ci JOIN releases r ON r.id = ci.release_id JOIN albums a ON a.id = r.album_id`;
    const mine = sql`ci.user_id = ${userId} AND ci.deleted_at IS NULL`;
    type Facet = { value: string; count: number };
    const facet = (select: SQL, join: SQL, extra: SQL = sql`true`) =>
      db.execute<Facet>(sql`SELECT ${select} AS value, count(DISTINCT ci.id)::int AS count ${from} ${join}
        WHERE ${mine} AND ${extra} GROUP BY 1 ORDER BY count DESC, 1`);
    const albumYear = sql`coalesce(a.original_release_year, r.release_year)`;
    const [
      artists,
      genres,
      styles,
      decades,
      countries,
      labels,
      formats,
      editionTypes,
      conditions,
      tagRows,
      locations,
      ranges,
    ] = await Promise.all([
      db.execute<{ id: string; value: string; count: number }>(sql`
          SELECT ar.id, ar.name AS value, count(DISTINCT ci.id)::int AS count ${from}
            JOIN album_artists aa ON aa.album_id = a.id JOIN artists ar ON ar.id = aa.artist_id
           WHERE ${mine} GROUP BY ar.id ORDER BY count DESC, ar.sort_name`),
      facet(
        sql`g.name`,
        sql`JOIN album_genres ag ON ag.album_id = a.id JOIN genres g ON g.id = ag.genre_id`,
      ),
      facet(
        sql`s.name`,
        sql`JOIN album_styles ast ON ast.album_id = a.id JOIN styles s ON s.id = ast.style_id`,
      ),
      db.execute<Facet>(sql`SELECT ((${albumYear} / 10) * 10)::int AS value, count(*)::int AS count ${from}
          WHERE ${mine} AND ${albumYear} IS NOT NULL GROUP BY 1 ORDER BY 1`),
      facet(sql`r.country`, sql``, sql`r.country IS NOT NULL`),
      facet(
        sql`lb.name`,
        sql`JOIN release_labels rl ON rl.release_id = r.id JOIN labels lb ON lb.id = rl.label_id`,
      ),
      facet(
        sql`fmt.value`,
        sql`JOIN release_formats rf ON rf.release_id = r.id
          CROSS JOIN LATERAL unnest(array_remove(ARRAY[rf.name, rf.size] || rf.descriptions, NULL)) AS fmt(value)`,
      ),
      facet(sql`r.edition_type::text`, sql``, sql`r.edition_type IS NOT NULL`),
      facet(sql`ci.condition_media::text`, sql``, sql`ci.condition_media IS NOT NULL`),
      facet(
        sql`tg.name`,
        sql`JOIN collection_item_tags cit ON cit.collection_item_id = ci.id JOIN tags tg ON tg.id = cit.tag_id`,
      ),
      facet(sql`ci.storage_location`, sql``, sql`ci.storage_location IS NOT NULL`),
      db.execute<{
        paid_min: string | null;
        paid_max: string | null;
        value_min: string | null;
        value_max: string | null;
        year_min: number | null;
        year_max: number | null;
        edition_year_min: number | null;
        edition_year_max: number | null;
      }>(sql`
          SELECT min(ci.purchase_price_base) AS paid_min, max(ci.purchase_price_base) AS paid_max,
                 min(ci.estimated_value_base) AS value_min, max(ci.estimated_value_base) AS value_max,
                 min(${albumYear}) AS year_min, max(${albumYear}) AS year_max,
                 min(r.release_year) AS edition_year_min, max(r.release_year) AS edition_year_max
            ${from} WHERE ${mine}`),
    ]);
    const r = ranges[0];
    const n = (v: string | null | undefined) => (v == null ? null : Number(v));
    return {
      artists: [...artists],
      genres: [...genres],
      styles: [...styles],
      decades: [...decades],
      countries: [...countries],
      labels: [...labels],
      formats: [...formats],
      editionTypes: [...editionTypes],
      conditions: [...conditions],
      tags: [...tagRows],
      locations: [...locations],
      ranges: {
        paid: { min: n(r?.paid_min), max: n(r?.paid_max) },
        value: { min: n(r?.value_min), max: n(r?.value_max) },
        year: { min: r?.year_min ?? null, max: r?.year_max ?? null },
        editionYear: { min: r?.edition_year_min ?? null, max: r?.edition_year_max ?? null },
      },
    };
  }

  /**
   * Points a copy to another edition — typically a manual entry made offline, later matched to
   * its Discogs release. The old private edition is removed if nothing else uses it.
   */
  async function relink(
    userId: string,
    itemId: string,
    target: { releaseId?: string; discogsReleaseId?: number },
  ) {
    const row = await getOwnedRow(userId, itemId);
    let releaseId = target.releaseId;
    if (releaseId) await catalog.assertReleaseVisible(userId, releaseId);
    else if (target.discogsReleaseId != null)
      releaseId = await catalog.importFromProvider(String(target.discogsReleaseId));
    if (!releaseId) throw invalid('Indicá la edición a vincular');
    if (releaseId !== row.releaseId) {
      await db
        .update(collectionItems)
        .set({ releaseId, updatedAt: nowOf(deps) })
        .where(eq(collectionItems.id, itemId));
      await catalog.deleteOrphanPrivateRelease(userId, row.releaseId);
      await valuation.recomputeItem(itemId);
    }
    const unlocked = (await hooks.afterChange?.(userId)) ?? [];
    return { item: await get(userId, itemId), unlockedAchievements: unlocked };
  }

  async function addPhoto(userId: string, itemId: string, url: string, caption?: string | null) {
    await getOwnedRow(userId, itemId);
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(collectionItemPhotos)
      .where(eq(collectionItemPhotos.collectionItemId, itemId));
    if (n >= MAX_PHOTOS_PER_ITEM) throw invalid(`Máximo ${MAX_PHOTOS_PER_ITEM} fotos por disco`);
    const [photo] = await db
      .insert(collectionItemPhotos)
      .values({ collectionItemId: itemId, url, caption: caption ?? null, position: n })
      .returning({
        id: collectionItemPhotos.id,
        url: collectionItemPhotos.url,
        caption: collectionItemPhotos.caption,
      });
    return photo!;
  }

  async function removePhoto(userId: string, itemId: string, photoId: string): Promise<void> {
    await getOwnedRow(userId, itemId);
    const deleted = await db
      .delete(collectionItemPhotos)
      .where(
        and(
          eq(collectionItemPhotos.id, photoId),
          eq(collectionItemPhotos.collectionItemId, itemId),
        ),
      )
      .returning({ id: collectionItemPhotos.id });
    if (!deleted.length) throw notFound('Foto');
  }

  return {
    add,
    update,
    remove,
    get,
    list,
    facets,
    exportRows,
    ownershipOf,
    getOwnedRow,
    addPhoto,
    removePhoto,
    relink,
  };
}

export interface CollectionItemDetail {
  id: string;
  release: ReleaseDetail;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  copyNumber: string | null;
  isFirstPressing: boolean | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  purchaseCurrency: string | null;
  purchasePlace: string | null;
  storageLocation: string | null;
  notes: string | null;
  tags: string[];
  /** Photos of this physical copy uploaded by the owner. */
  photos: { id: string; url: string; caption: string | null }[];
  value: {
    baseCurrency: string | null;
    paid: number | null;
    estimated: number | null;
    difference: number | null;
    estimate: {
      amount: number;
      currency: string;
      source: string;
      kind: string;
      capturedAt: string | null;
    } | null;
    override: { amount: number; currency: string | null } | null;
    disclaimer: string;
  };
  otherCopiesCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CollectionService = ReturnType<typeof collectionService>;
