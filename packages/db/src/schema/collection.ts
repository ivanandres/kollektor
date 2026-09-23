import {
  boolean,
  char,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { albums, releases } from './catalog';
import { grade, wishlistStatus } from './enums';

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });

/** One physical copy owned by a user. The core object of the app. */
export const collectionItems = pgTable(
  'collection_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'restrict' }),
    conditionMedia: grade('condition_media'),
    conditionSleeve: grade('condition_sleeve'),
    /** Number of this copy in a numbered edition, e.g. "245/500". */
    copyNumber: text('copy_number'),
    isFirstPressing: boolean('is_first_pressing'),
    purchaseDate: date('purchase_date'),
    purchasePrice: money('purchase_price'),
    purchaseCurrency: char('purchase_currency', { length: 3 }),
    /** purchase_price converted to the user's base currency at purchase date. */
    purchasePriceBase: money('purchase_price_base'),
    baseCurrency: char('base_currency', { length: 3 }),
    /** Private: never exposed publicly. */
    purchasePlace: text('purchase_place'),
    /** Private: never exposed publicly. */
    storageLocation: text('storage_location'),
    notes: text('notes'),
    valueOverride: money('value_override'),
    valueOverrideCurrency: char('value_override_currency', { length: 3 }),
    /** Denormalized current estimate in base_currency (override > market snapshot). */
    estimatedValueBase: money('estimated_value_base'),
    estimatedValueSource: text('estimated_value_source'),
    estimatedValueUpdatedAt: timestamp('estimated_value_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    /** Client-generated id so retries on flaky connections don't create duplicates. */
    clientRequestId: text('client_request_id'),
  },
  (t) => [
    index('collection_items_user_idx').on(t.userId, t.deletedAt),
    uniqueIndex('collection_items_client_request_uq').on(t.userId, t.clientRequestId),
    index('collection_items_release_idx').on(t.releaseId),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('tags_user_name_uq').on(t.userId, t.name)],
);

export const collectionItemTags = pgTable(
  'collection_item_tags',
  {
    collectionItemId: uuid('collection_item_id')
      .notNull()
      .references(() => collectionItems.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.collectionItemId, t.tagId] })],
);

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'restrict' }),
    /** Optional: a specific edition. NULL = any edition of the album. */
    releaseId: uuid('release_id').references(() => releases.id, { onDelete: 'set null' }),
    targetPrice: money('target_price'),
    targetCurrency: char('target_currency', { length: 3 }),
    /** 1 = high, 2 = medium, 3 = low */
    priority: smallint('priority').notNull().default(2),
    status: wishlistStatus('status').notNull().default('wanted'),
    notes: text('notes'),
    collectionItemId: uuid('collection_item_id').references(() => collectionItems.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    clientRequestId: text('client_request_id'),
  },
  (t) => [
    index('wishlist_items_user_idx').on(t.userId, t.status),
    uniqueIndex('wishlist_items_client_request_uq').on(t.userId, t.clientRequestId),
  ],
);
