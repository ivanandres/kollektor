import { and, asc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { schema } from '@kollektor/db';
import type { Db } from '../../context';
import { normalizeCatalogNumber, normalizeText, sortName } from '../../lib/normalize';

const {
  artists,
  albums,
  albumArtists,
  albumGenres,
  albumStyles,
  genres,
  styles,
  labels,
  releases,
  releaseLabels,
  releaseFormats,
  releaseImages,
  tracks,
  externalIds,
} = schema;

type EntityType = (typeof schema.entityType.enumValues)[number];

/** Rows visible to a user: shared catalog (created_by NULL) or their own manual rows. */
export function visibleTo(column: AnyPgColumn, userId: string): SQL {
  return or(isNull(column), eq(column, userId))!;
}

export async function findExternal(
  db: Db,
  entityType: EntityType,
  source: string,
  externalId: string,
): Promise<{ entityId: string; lastSyncedAt: Date | null } | null> {
  const [row] = await db
    .select({ entityId: externalIds.entityId, lastSyncedAt: externalIds.lastSyncedAt })
    .from(externalIds)
    .where(
      and(
        eq(externalIds.entityType, entityType),
        eq(externalIds.source, source),
        eq(externalIds.externalId, externalId),
      ),
    );
  return row ?? null;
}

export async function linkExternal(
  db: Db,
  entityType: EntityType,
  entityId: string,
  source: string,
  externalId: string,
  url: string | null,
  syncedAt: Date,
): Promise<void> {
  await db
    .insert(externalIds)
    .values({ entityType, entityId, source, externalId, url, lastSyncedAt: syncedAt })
    .onConflictDoUpdate({
      target: [externalIds.entityType, externalIds.source, externalIds.externalId],
      set: { lastSyncedAt: syncedAt, url },
    });
}

export async function insertArtist(
  db: Db,
  name: string,
  createdByUserId: string | null,
): Promise<string> {
  const [row] = await db
    .insert(artists)
    .values({
      name,
      nameNormalized: normalizeText(name),
      sortName: sortName(name),
      createdByUserId,
      isVerified: createdByUserId == null,
    })
    .returning({ id: artists.id });
  return row!.id;
}

/** Manual entry: reuse an artist the user can already see with the same normalized name. */
export async function findVisibleArtistByName(
  db: Db,
  name: string,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(
      and(
        eq(artists.nameNormalized, normalizeText(name)),
        visibleTo(artists.createdByUserId, userId),
      ),
    )
    // Prefer shared (verified) rows over the user's own.
    .orderBy(sql`${artists.createdByUserId} IS NOT NULL`, asc(artists.createdAt))
    .limit(1);
  return row?.id ?? null;
}

export async function findVisibleLabelByName(
  db: Db,
  name: string,
  userId: string | null,
): Promise<string | null> {
  const cond = userId
    ? visibleTo(labels.createdByUserId, userId)
    : isNull(labels.createdByUserId);
  const [row] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.nameNormalized, normalizeText(name)), cond))
    .orderBy(sql`${labels.createdByUserId} IS NOT NULL`)
    .limit(1);
  return row?.id ?? null;
}

export async function insertLabel(
  db: Db,
  name: string,
  createdByUserId: string | null,
): Promise<string> {
  const [row] = await db
    .insert(labels)
    .values({ name, nameNormalized: normalizeText(name), createdByUserId })
    .returning({ id: labels.id });
  return row!.id;
}

async function upsertNames(
  db: Db,
  table: typeof genres | typeof styles,
  names: string[],
): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  await db
    .insert(table)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing();
  const rows = await db.select({ id: table.id }).from(table).where(inArray(table.name, unique));
  return rows.map((r) => r.id);
}

export async function setAlbumGenresAndStyles(
  db: Db,
  albumId: string,
  genreNames: string[],
  styleNames: string[],
): Promise<void> {
  const genreIds = await upsertNames(db, genres, genreNames);
  const styleIds = await upsertNames(db, styles, styleNames);
  if (genreIds.length)
    await db
      .insert(albumGenres)
      .values(genreIds.map((genreId) => ({ albumId, genreId })))
      .onConflictDoNothing();
  if (styleIds.length)
    await db
      .insert(albumStyles)
      .values(styleIds.map((styleId) => ({ albumId, styleId })))
      .onConflictDoNothing();
}

export interface NewAlbum {
  title: string;
  originalReleaseYear: number | null;
  description?: string | null;
  coverImageUrl?: string | null;
  createdByUserId: string | null;
}

export async function insertAlbum(
  db: Db,
  a: NewAlbum,
  artistLinks: { artistId: string; joinPhrase?: string | null }[],
): Promise<string> {
  const [row] = await db
    .insert(albums)
    .values({
      title: a.title,
      titleNormalized: normalizeText(a.title),
      originalReleaseYear: a.originalReleaseYear,
      description: a.description ?? null,
      coverImageUrl: a.coverImageUrl ?? null,
      createdByUserId: a.createdByUserId,
      isVerified: a.createdByUserId == null,
    })
    .returning({ id: albums.id });
  const albumId = row!.id;
  const seen = new Set<string>();
  const links = artistLinks.filter((l) => !seen.has(l.artistId) && seen.add(l.artistId));
  if (links.length)
    await db.insert(albumArtists).values(
      links.map((l, position) => ({
        albumId,
        artistId: l.artistId,
        position,
        joinPhrase: l.joinPhrase ?? null,
      })),
    );
  return albumId;
}

export interface NewRelease {
  albumId: string;
  title?: string | null;
  releaseYear: number | null;
  releaseDate?: string | null;
  country: string | null;
  editionType?: (typeof schema.editionType.enumValues)[number] | null;
  formatSummary: string | null;
  barcode: string | null;
  notes: string | null;
  communityHave?: number | null;
  communityWant?: number | null;
  createdByUserId: string | null;
}

export interface NewReleaseChildren {
  labels: { labelId: string; catalogNumber: string | null }[];
  formats: {
    name: string;
    qty: number;
    size?: string | null;
    speed?: string | null;
    color?: string | null;
    descriptions: string[];
  }[];
  images: { kind: 'primary' | 'secondary' | 'user'; url: string; width?: number | null; height?: number | null }[];
  tracks: {
    position: string | null;
    side: string | null;
    discNumber: number;
    title: string;
    durationSeconds: number | null;
    artistCredit: string | null;
  }[];
}

export async function insertRelease(
  db: Db,
  r: NewRelease,
  children: NewReleaseChildren,
): Promise<string> {
  const [row] = await db
    .insert(releases)
    .values({ ...r, isVerified: r.createdByUserId == null })
    .returning({ id: releases.id });
  const releaseId = row!.id;
  if (children.labels.length)
    await db.insert(releaseLabels).values(
      children.labels.map((l, position) => ({
        releaseId,
        labelId: l.labelId,
        catalogNumber: l.catalogNumber,
        catalogNumberNormalized: l.catalogNumber ? normalizeCatalogNumber(l.catalogNumber) : null,
        position,
      })),
    );
  if (children.formats.length)
    await db
      .insert(releaseFormats)
      .values(children.formats.map((f, position) => ({ ...f, releaseId, position })));
  if (children.images.length)
    await db
      .insert(releaseImages)
      .values(children.images.map((img, position) => ({ ...img, releaseId, position })));
  if (children.tracks.length)
    await db.insert(tracks).values(
      children.tracks.map((t, i) => ({
        ...t,
        releaseId,
        sequence: i + 1,
        titleNormalized: normalizeText(t.title),
      })),
    );
  return releaseId;
}
