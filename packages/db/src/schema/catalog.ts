import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { editionType, entityType, imageKind, linkStatus } from './enums';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
/** NULL = shared catalog row (from an external source). Set = private manual entry of that user. */
const createdBy = () =>
  text('created_by_user_id').references(() => user.id, { onDelete: 'cascade' });

export const artists = pgTable(
  'artists',
  {
    id: id(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    sortName: text('sort_name').notNull(),
    imageUrl: text('image_url'),
    profile: text('profile'),
    createdByUserId: createdBy(),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('artists_name_trgm').using('gin', t.nameNormalized.op('gin_trgm_ops'))],
);

export const labels = pgTable(
  'labels',
  {
    id: id(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    createdByUserId: createdBy(),
    createdAt: createdAt(),
  },
  (t) => [index('labels_name_trgm').using('gin', t.nameNormalized.op('gin_trgm_ops'))],
);

export const genres = pgTable('genres', {
  id: id(),
  name: text('name').notNull().unique(),
});

export const styles = pgTable('styles', {
  id: id(),
  name: text('name').notNull().unique(),
});

/** An album is the abstract work (≈ Discogs "master"). */
export const albums = pgTable(
  'albums',
  {
    id: id(),
    title: text('title').notNull(),
    titleNormalized: text('title_normalized').notNull(),
    originalReleaseYear: smallint('original_release_year'),
    description: text('description'),
    coverImageUrl: text('cover_image_url'),
    mainReleaseId: uuid('main_release_id').references((): AnyPgColumn => releases.id, {
      onDelete: 'set null',
    }),
    createdByUserId: createdBy(),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('albums_title_trgm').using('gin', t.titleNormalized.op('gin_trgm_ops'))],
);

export const albumArtists = pgTable(
  'album_artists',
  {
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    artistId: uuid('artist_id')
      .notNull()
      .references(() => artists.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull().default(0),
    joinPhrase: text('join_phrase'),
    role: text('role'),
  },
  (t) => [
    primaryKey({ columns: [t.albumId, t.artistId] }),
    index('album_artists_artist_idx').on(t.artistId),
  ],
);

export const albumGenres = pgTable(
  'album_genres',
  {
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    genreId: uuid('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.genreId] })],
);

export const albumStyles = pgTable(
  'album_styles',
  {
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    styleId: uuid('style_id')
      .notNull()
      .references(() => styles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.styleId] })],
);

/** A release is a specific edition/pressing of an album. */
export const releases = pgTable(
  'releases',
  {
    id: id(),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    title: text('title'),
    releaseYear: smallint('release_year'),
    releaseDate: date('release_date'),
    country: text('country'),
    editionType: editionType('edition_type'),
    formatSummary: text('format_summary'),
    barcode: text('barcode'),
    notes: text('notes'),
    communityHave: integer('community_have'),
    communityWant: integer('community_want'),
    createdByUserId: createdBy(),
    isVerified: boolean('is_verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('releases_album_idx').on(t.albumId), index('releases_barcode_idx').on(t.barcode)],
);

export const releaseLabels = pgTable(
  'release_labels',
  {
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    catalogNumber: text('catalog_number'),
    catalogNumberNormalized: text('catalog_number_normalized'),
    position: smallint('position').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.releaseId, t.labelId, t.position] }),
    index('release_labels_catno_trgm').using('gin', t.catalogNumberNormalized.op('gin_trgm_ops')),
    index('release_labels_label_idx').on(t.labelId),
  ],
);

export const releaseFormats = pgTable(
  'release_formats',
  {
    id: id(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    /** Vinyl, CD, Cassette, Box Set… */
    name: text('name').notNull(),
    qty: smallint('qty').notNull().default(1),
    size: text('size'),
    speed: text('speed'),
    color: text('color'),
    /** LP, Album, Reissue, Gatefold, Limited Edition, Picture Disc… */
    descriptions: text('descriptions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    position: smallint('position').notNull().default(0),
  },
  (t) => [index('release_formats_release_idx').on(t.releaseId)],
);

export const releaseImages = pgTable(
  'release_images',
  {
    id: id(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    kind: imageKind('kind').notNull().default('secondary'),
    url: text('url').notNull(),
    storageKey: text('storage_key'),
    width: integer('width'),
    height: integer('height'),
    position: smallint('position').notNull().default(0),
  },
  (t) => [index('release_images_release_idx').on(t.releaseId)],
);

export const tracks = pgTable(
  'tracks',
  {
    id: id(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    /** As printed: "A1", "B3", "1-04"… */
    position: text('position'),
    side: text('side'),
    discNumber: smallint('disc_number').notNull().default(1),
    sequence: smallint('sequence').notNull(),
    title: text('title').notNull(),
    titleNormalized: text('title_normalized').notNull(),
    durationSeconds: integer('duration_seconds'),
    /** Track-level artists when they differ from the album artist (compilations). */
    artistCredit: text('artist_credit'),
    credits: jsonb('credits'),
  },
  (t) => [
    index('tracks_release_idx').on(t.releaseId),
    index('tracks_title_trgm').using('gin', t.titleNormalized.op('gin_trgm_ops')),
  ],
);

export const trackLinks = pgTable(
  'track_links',
  {
    id: id(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    /** spotify | youtube | lyrics */
    provider: text('provider').notNull(),
    status: linkStatus('status').notNull(),
    url: text('url'),
    externalId: text('external_id'),
    confidence: real('confidence'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('track_links_track_provider_uq').on(t.trackId, t.provider)],
);

/** Generic mapping from our entities to ids in external sources (discogs, musicbrainz, …). */
export const externalIds = pgTable(
  'external_ids',
  {
    id: id(),
    entityType: entityType('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('external_ids_source_uq').on(t.entityType, t.source, t.externalId),
    index('external_ids_entity_idx').on(t.entityType, t.entityId),
  ],
);
