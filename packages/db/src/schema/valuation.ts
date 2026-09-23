import {
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { releases } from './catalog';
import { grade, priceKind } from './enums';

export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releases.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    kind: priceKind('kind').notNull(),
    condition: grade('condition'),
    price: numeric('price', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('price_snapshots_release_idx').on(t.releaseId, t.capturedAt)],
);

export const collectionValueSnapshots = pgTable(
  'collection_value_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    capturedOn: date('captured_on').notNull(),
    itemCount: integer('item_count').notNull(),
    totalInvested: numeric('total_invested', { precision: 14, scale: 2, mode: 'number' }).notNull(),
    totalEstimated: numeric('total_estimated', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
  },
  (t) => [uniqueIndex('collection_value_snapshots_uq').on(t.userId, t.capturedOn)],
);

export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: date('date').notNull(),
    base: char('base', { length: 3 }).notNull(),
    quote: char('quote', { length: 3 }).notNull(),
    rate: numeric('rate', { precision: 20, scale: 10, mode: 'number' }).notNull(),
    source: text('source').notNull(),
  },
  (t) => [uniqueIndex('fx_rates_uq').on(t.date, t.base, t.quote)],
);
