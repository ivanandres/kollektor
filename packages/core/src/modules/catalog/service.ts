import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { ManualReleaseInput } from '@kollektor/schemas';
import { nowOf, type CoreDeps, type Db } from '../../context';
import { DomainError, notFound } from '../../lib/errors';
import { sideFromPosition, stripDisambiguation } from '../../lib/normalize';
import type { ExternalFormat, ExternalMaster, ExternalRelease } from '../../ports';
import * as repo from './repository';

const {
  albums,
  albumArtists,
  artists,
  albumGenres,
  albumStyles,
  genres,
  styles,
  releases,
  releaseLabels,
  labels,
  releaseFormats,
  releaseImages,
  tracks,
  externalIds,
} = schema;

type EditionType = (typeof schema.editionType.enumValues)[number];

const SIZE_RE = /^\d+(\.\d+)?"$/;
const SPEED_RE = /RPM$/i;

export function splitFormat(f: ExternalFormat) {
  const size = f.descriptions.find((d) => SIZE_RE.test(d)) ?? null;
  const speed = f.descriptions.find((d) => SPEED_RE.test(d)) ?? null;
  return {
    name: f.name,
    qty: f.qty,
    size,
    speed,
    color: f.text,
    descriptions: f.descriptions.filter((d) => d !== size && d !== speed),
  };
}

export function inferEditionType(
  descriptions: string[],
  releaseYear: number | null,
  originalYear: number | null,
): EditionType | null {
  const d = new Set(descriptions.map((x) => x.toLowerCase()));
  if (d.has('unofficial release')) return 'bootleg';
  if (d.has('promo')) return 'promo';
  if (d.has('limited edition')) return 'limited';
  if (d.has('remastered')) return 'remaster';
  if (d.has('reissue') || d.has('repress')) return 'reissue';
  if (d.has('compilation')) return 'compilation';
  if (releaseYear != null && originalYear != null && releaseYear === originalYear)
    return 'original';
  return null;
}

/** Discogs uses "1-04" / "CD1-4" for multi-disc positions. */
function discNumberOf(position: string | null): number {
  if (!position) return 1;
  const m = /^(?:CD|LP|DVD)?(\d+)[-.]\d+/i.exec(position);
  return m ? Number(m[1]) : 1;
}

export function catalogService(deps: CoreDeps) {
  const { db } = deps;

  async function resolveExternalArtists(
    tx: Db,
    ext: ExternalRelease | ExternalMaster,
    source: string,
  ) {
    const links: { artistId: string; joinPhrase: string | null }[] = [];
    for (const a of ext.artists) {
      const name = stripDisambiguation(a.name);
      let artistId: string | null = null;
      if (a.externalId) {
        artistId = (await repo.findExternal(tx, 'artist', source, a.externalId))?.entityId ?? null;
      }
      if (!artistId) {
        artistId = await repo.insertArtist(tx, name, null);
        if (a.externalId)
          await repo.linkExternal(tx, 'artist', artistId, source, a.externalId, null, nowOf(deps));
      }
      links.push({ artistId, joinPhrase: a.joinPhrase ?? null });
    }
    return links;
  }

  async function resolveExternalLabels(tx: Db, ext: ExternalRelease) {
    const out: { labelId: string; catalogNumber: string | null }[] = [];
    for (const l of ext.labels) {
      const name = stripDisambiguation(l.name);
      let labelId: string | null = null;
      if (l.externalId)
        labelId =
          (await repo.findExternal(tx, 'label', ext.source, l.externalId))?.entityId ?? null;
      if (!labelId) {
        labelId = await repo.insertLabel(tx, name, null);
        if (l.externalId)
          await repo.linkExternal(
            tx,
            'label',
            labelId,
            ext.source,
            l.externalId,
            null,
            nowOf(deps),
          );
      }
      const catalogNumber =
        l.catalogNumber && l.catalogNumber.toLowerCase() !== 'none' ? l.catalogNumber : null;
      out.push({ labelId, catalogNumber });
    }
    return out;
  }

  /** Album key: the master when present, otherwise the release itself. */
  const albumKey = (ext: ExternalRelease) =>
    ext.masterId ? `master:${ext.masterId}` : `release:${ext.externalId}`;

  async function ensureAlbum(
    tx: Db,
    ext: ExternalRelease,
    master: ExternalMaster | null,
  ): Promise<string> {
    const key = albumKey(ext);
    const existing = await repo.findExternal(tx, 'album', ext.source, key);
    if (existing) return existing.entityId;
    const base = master ?? ext;
    const artistLinks = await resolveExternalArtists(tx, base, ext.source);
    const cover = (master?.images ?? ext.images).find((i) => i.kind === 'primary') ?? ext.images[0];
    const albumId = await repo.insertAlbum(
      tx,
      {
        title: base.title,
        originalReleaseYear: master?.year ?? ext.year,
        coverImageUrl: cover?.url ?? null,
        createdByUserId: null,
      },
      artistLinks,
    );
    await repo.setAlbumGenresAndStyles(tx, albumId, base.genres, base.styles);
    await repo.linkExternal(
      tx,
      'album',
      albumId,
      ext.source,
      key,
      master?.url ?? null,
      nowOf(deps),
    );
    return albumId;
  }

  /**
   * Stores an external release (and its album/artists/labels) in the shared catalog.
   * Idempotent: returns the existing release if already imported.
   */
  async function importExternalRelease(
    ext: ExternalRelease,
    master: ExternalMaster | null = null,
  ): Promise<string> {
    return db.transaction(async (tx) => {
      const existing = await repo.findExternal(tx, 'release', ext.source, ext.externalId);
      if (existing) {
        await tx
          .update(releases)
          .set({
            communityHave: ext.community.have,
            communityWant: ext.community.want,
            updatedAt: nowOf(deps),
          })
          .where(eq(releases.id, existing.entityId));
        await repo.linkExternal(
          tx,
          'release',
          existing.entityId,
          ext.source,
          ext.externalId,
          ext.url,
          nowOf(deps),
        );
        return existing.entityId;
      }
      const albumId = await ensureAlbum(tx, ext, master);
      const [album] = await tx
        .select({ year: albums.originalReleaseYear, mainReleaseId: albums.mainReleaseId })
        .from(albums)
        .where(eq(albums.id, albumId));
      const allDescriptions = ext.formats.flatMap((f) => f.descriptions);
      const releaseId = await repo.insertRelease(
        tx,
        {
          albumId,
          title: ext.title,
          releaseYear: ext.year,
          releaseDate: ext.releaseDate,
          country: ext.country,
          editionType: inferEditionType(allDescriptions, ext.year, album?.year ?? null),
          formatSummary: ext.formatSummary,
          barcode: ext.barcodes[0] ?? null,
          notes: ext.notes,
          communityHave: ext.community.have,
          communityWant: ext.community.want,
          createdByUserId: null,
        },
        {
          labels: await resolveExternalLabels(tx, ext),
          formats: ext.formats.map(splitFormat),
          images: ext.images.map((i) => ({
            kind: i.kind,
            url: i.url,
            width: i.width,
            height: i.height,
          })),
          tracks: ext.tracklist.map((t) => ({
            position: t.position,
            side: sideFromPosition(t.position),
            discNumber: discNumberOf(t.position),
            title: t.title,
            durationSeconds: t.durationSeconds,
            artistCredit: t.artistCredit,
          })),
        },
      );
      await repo.linkExternal(
        tx,
        'release',
        releaseId,
        ext.source,
        ext.externalId,
        ext.url,
        nowOf(deps),
      );
      const isMain = master?.mainReleaseId === ext.externalId;
      if (isMain || album?.mainReleaseId == null) {
        await tx.update(albums).set({ mainReleaseId: releaseId }).where(eq(albums.id, albumId));
      }
      if (ext.lowestPrice) {
        await tx.insert(schema.priceSnapshots).values({
          releaseId,
          source: ext.source,
          kind: 'lowest',
          price: ext.lowestPrice.amount,
          currency: ext.lowestPrice.currency,
          capturedAt: nowOf(deps),
        });
      }
      return releaseId;
    });
  }

  function requireProvider() {
    if (!deps.catalogProvider)
      throw new DomainError('NOT_CONFIGURED', 'El catálogo externo no está configurado');
    return deps.catalogProvider;
  }

  /** Fetches a release from the external provider (with its master) and imports it. */
  async function importFromProvider(externalReleaseId: string): Promise<string> {
    const provider = requireProvider();
    const existing = await repo.findExternal(db, 'release', provider.source, externalReleaseId);
    if (existing) return existing.entityId;
    const ext = await provider.getRelease(externalReleaseId);
    let master: ExternalMaster | null = null;
    if (ext.masterId) {
      const knownAlbum = await repo.findExternal(
        db,
        'album',
        provider.source,
        `master:${ext.masterId}`,
      );
      if (!knownAlbum) master = await provider.getMaster(ext.masterId);
    }
    return importExternalRelease(ext, master);
  }

  /** Imports the main release of an external master; returns the album id. */
  async function importMasterFromProvider(externalMasterId: string): Promise<string> {
    const provider = requireProvider();
    const known = await repo.findExternal(
      db,
      'album',
      provider.source,
      `master:${externalMasterId}`,
    );
    if (known) return known.entityId;
    const master = await provider.getMaster(externalMasterId);
    if (!master.mainReleaseId) throw notFound('Edición principal del álbum');
    const ext = await provider.getRelease(master.mainReleaseId);
    const releaseId = await importExternalRelease(ext, master);
    const [row] = await db
      .select({ albumId: releases.albumId })
      .from(releases)
      .where(eq(releases.id, releaseId));
    return row!.albumId;
  }

  /** Creates a private (unverified) album + release from manual data. */
  async function createManualRelease(userId: string, input: ManualReleaseInput): Promise<string> {
    return db.transaction(async (tx) => {
      const artistLinks: { artistId: string }[] = [];
      for (const name of input.album.artists) {
        const artistId =
          (await repo.findVisibleArtistByName(tx, name, userId)) ??
          (await repo.insertArtist(tx, name, userId));
        artistLinks.push({ artistId });
      }
      const albumId = await repo.insertAlbum(
        tx,
        {
          title: input.album.title,
          originalReleaseYear: input.album.originalReleaseYear ?? null,
          description: input.album.description ?? null,
          createdByUserId: userId,
        },
        artistLinks,
      );
      await repo.setAlbumGenresAndStyles(tx, albumId, input.album.genres, input.album.styles);

      const labelLinks: { labelId: string; catalogNumber: string | null }[] = [];
      for (const l of input.release.labels) {
        const labelId =
          (await repo.findVisibleLabelByName(tx, l.name, userId)) ??
          (await repo.insertLabel(tx, l.name, userId));
        labelLinks.push({ labelId, catalogNumber: l.catalogNumber ?? null });
      }
      const formats = input.release.formats.length
        ? input.release.formats
        : [{ name: 'Vinyl', qty: 1, descriptions: ['LP'] }];
      const formatSummary = formats
        .map((f) =>
          [f.qty > 1 ? `${f.qty}×` : '', f.name, ...f.descriptions].filter(Boolean).join(' '),
        )
        .join(' + ');
      const releaseYear = input.release.year ?? null;
      const originalYear = input.album.originalReleaseYear ?? null;
      const releaseId = await repo.insertRelease(
        tx,
        {
          albumId,
          releaseYear,
          country: input.release.country ?? null,
          editionType:
            input.release.editionType ??
            inferEditionType(
              formats.flatMap((f) => f.descriptions),
              releaseYear,
              originalYear,
            ),
          formatSummary,
          barcode: input.release.barcode ?? null,
          notes: input.release.notes ?? null,
          createdByUserId: userId,
        },
        {
          labels: labelLinks,
          formats: formats.map((f) => ({
            name: f.name,
            qty: f.qty,
            size: f.size ?? null,
            speed: f.speed ?? null,
            color: f.color ?? null,
            descriptions: f.descriptions,
          })),
          images: [],
          tracks: input.tracks.map((t) => ({
            position: t.position ?? null,
            side: sideFromPosition(t.position),
            discNumber: discNumberOf(t.position ?? null),
            title: t.title,
            durationSeconds: t.duration ?? null,
            artistCredit: t.artistCredit ?? null,
          })),
        },
      );
      await tx.update(albums).set({ mainReleaseId: releaseId }).where(eq(albums.id, albumId));
      return releaseId;
    });
  }

  async function assertReleaseVisible(userId: string, releaseId: string): Promise<void> {
    const [row] = await db
      .select({ id: releases.id })
      .from(releases)
      .where(and(eq(releases.id, releaseId), repo.visibleTo(releases.createdByUserId, userId)));
    if (!row) throw notFound('Edición');
  }

  async function assertAlbumVisible(userId: string, albumId: string): Promise<void> {
    const [row] = await db
      .select({ id: albums.id })
      .from(albums)
      .where(and(eq(albums.id, albumId), repo.visibleTo(albums.createdByUserId, userId)));
    if (!row) throw notFound('Álbum');
  }

  async function albumIdOfRelease(releaseId: string): Promise<string> {
    const [row] = await db
      .select({ albumId: releases.albumId })
      .from(releases)
      .where(eq(releases.id, releaseId));
    if (!row) throw notFound('Edición');
    return row.albumId;
  }

  async function getAlbumSummaries(albumIds: string[]) {
    if (albumIds.length === 0) return new Map<string, AlbumSummary>();
    const [albumRows, artistRows, genreRows, styleRows] = await Promise.all([
      db.select().from(albums).where(inArray(albums.id, albumIds)),
      db
        .select({
          albumId: albumArtists.albumId,
          id: artists.id,
          name: artists.name,
          joinPhrase: albumArtists.joinPhrase,
        })
        .from(albumArtists)
        .innerJoin(artists, eq(artists.id, albumArtists.artistId))
        .where(inArray(albumArtists.albumId, albumIds))
        .orderBy(asc(albumArtists.position)),
      db
        .select({ albumId: albumGenres.albumId, name: genres.name })
        .from(albumGenres)
        .innerJoin(genres, eq(genres.id, albumGenres.genreId))
        .where(inArray(albumGenres.albumId, albumIds)),
      db
        .select({ albumId: albumStyles.albumId, name: styles.name })
        .from(albumStyles)
        .innerJoin(styles, eq(styles.id, albumStyles.styleId))
        .where(inArray(albumStyles.albumId, albumIds)),
    ]);
    const map = new Map<string, AlbumSummary>();
    for (const a of albumRows) {
      const albumArtistsList = artistRows.filter((r) => r.albumId === a.id);
      map.set(a.id, {
        id: a.id,
        title: a.title,
        originalReleaseYear: a.originalReleaseYear,
        description: a.description,
        coverImageUrl: a.coverImageUrl,
        mainReleaseId: a.mainReleaseId,
        isVerified: a.isVerified,
        artists: albumArtistsList.map(({ id, name, joinPhrase }) => ({ id, name, joinPhrase })),
        artistDisplay: formatArtistCredit(albumArtistsList),
        genres: genreRows
          .filter((g) => g.albumId === a.id)
          .map((g) => g.name)
          .sort(),
        styles: styleRows
          .filter((s) => s.albumId === a.id)
          .map((s) => s.name)
          .sort(),
      });
    }
    return map;
  }

  async function getReleaseDetail(userId: string, releaseId: string): Promise<ReleaseDetail> {
    const [release] = await db
      .select()
      .from(releases)
      .where(and(eq(releases.id, releaseId), repo.visibleTo(releases.createdByUserId, userId)));
    if (!release) throw notFound('Edición');
    const [albumMap, labelRows, formatRows, imageRows, trackRows, extRows] = await Promise.all([
      getAlbumSummaries([release.albumId]),
      db
        .select({ id: labels.id, name: labels.name, catalogNumber: releaseLabels.catalogNumber })
        .from(releaseLabels)
        .innerJoin(labels, eq(labels.id, releaseLabels.labelId))
        .where(eq(releaseLabels.releaseId, releaseId))
        .orderBy(asc(releaseLabels.position)),
      db
        .select()
        .from(releaseFormats)
        .where(eq(releaseFormats.releaseId, releaseId))
        .orderBy(asc(releaseFormats.position)),
      db
        .select()
        .from(releaseImages)
        .where(eq(releaseImages.releaseId, releaseId))
        .orderBy(asc(releaseImages.position)),
      db.select().from(tracks).where(eq(tracks.releaseId, releaseId)).orderBy(asc(tracks.sequence)),
      db
        .select({
          source: externalIds.source,
          externalId: externalIds.externalId,
          url: externalIds.url,
          lastSyncedAt: externalIds.lastSyncedAt,
        })
        .from(externalIds)
        .where(and(eq(externalIds.entityType, 'release'), eq(externalIds.entityId, releaseId))),
    ]);
    const album = albumMap.get(release.albumId)!;
    return {
      id: release.id,
      album,
      title: release.title,
      releaseYear: release.releaseYear,
      releaseDate: release.releaseDate,
      country: release.country,
      editionType: release.editionType,
      formatSummary: release.formatSummary,
      barcode: release.barcode,
      notes: release.notes,
      isVerified: release.isVerified,
      community: { have: release.communityHave, want: release.communityWant },
      labels: labelRows,
      formats: formatRows.map(({ name, qty, size, speed, color, descriptions }) => ({
        name,
        qty,
        size,
        speed,
        color,
        descriptions,
      })),
      images: imageRows.map(({ kind, url, width, height }) => ({ kind, url, width, height })),
      coverImageUrl:
        imageRows.find((i) => i.kind === 'primary')?.url ??
        imageRows[0]?.url ??
        album.coverImageUrl,
      tracks: trackRows.map(
        ({ id, position, side, discNumber, title, durationSeconds, artistCredit }) => ({
          id,
          position,
          side,
          discNumber,
          title,
          durationSeconds,
          artistCredit,
        }),
      ),
      external: extRows,
    };
  }

  /** Other editions of the same album visible to the user. */
  async function listAlbumReleases(userId: string, albumId: string) {
    await assertAlbumVisible(userId, albumId);
    return db
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
      .where(and(eq(releases.albumId, albumId), repo.visibleTo(releases.createdByUserId, userId)))
      .orderBy(asc(releases.releaseYear));
  }

  return {
    importExternalRelease,
    importFromProvider,
    importMasterFromProvider,
    createManualRelease,
    assertReleaseVisible,
    assertAlbumVisible,
    albumIdOfRelease,
    getAlbumSummaries,
    getReleaseDetail,
    listAlbumReleases,
  };
}

export function formatArtistCredit(list: { name: string; joinPhrase: string | null }[]): string {
  return list
    .map((a, i) => {
      const name = stripDisambiguation(a.name);
      if (i === list.length - 1) return name;
      const jp = a.joinPhrase?.trim();
      return jp && jp !== ',' ? `${name} ${jp} ` : `${name}, `;
    })
    .join('');
}

export interface AlbumSummary {
  id: string;
  title: string;
  originalReleaseYear: number | null;
  description: string | null;
  coverImageUrl: string | null;
  mainReleaseId: string | null;
  isVerified: boolean;
  artists: { id: string; name: string; joinPhrase: string | null }[];
  artistDisplay: string;
  genres: string[];
  styles: string[];
}

export interface ReleaseDetail {
  id: string;
  album: AlbumSummary;
  title: string | null;
  releaseYear: number | null;
  releaseDate: string | null;
  country: string | null;
  editionType: EditionType | null;
  formatSummary: string | null;
  barcode: string | null;
  notes: string | null;
  isVerified: boolean;
  community: { have: number | null; want: number | null };
  labels: { id: string; name: string; catalogNumber: string | null }[];
  formats: {
    name: string;
    qty: number;
    size: string | null;
    speed: string | null;
    color: string | null;
    descriptions: string[];
  }[];
  images: {
    kind: 'primary' | 'secondary' | 'user';
    url: string;
    width: number | null;
    height: number | null;
  }[];
  coverImageUrl: string | null;
  tracks: {
    id: string;
    position: string | null;
    side: string | null;
    discNumber: number;
    title: string;
    durationSeconds: number | null;
    artistCredit: string | null;
  }[];
  external: { source: string; externalId: string; url: string | null; lastSyncedAt: Date | null }[];
}

export type CatalogService = ReturnType<typeof catalogService>;
