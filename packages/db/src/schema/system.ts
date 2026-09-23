import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { jobStatus, visibility } from './enums';

/**
 * Append-only domain events. Used today for stats ("added per month") and achievement
 * triggers; in V2 it is the source of the social activity feed.
 */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    payload: jsonb('payload'),
    visibility: visibility('visibility').notNull().default('private'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_events_user_idx').on(t.userId, t.createdAt)],
);

/** Postgres-backed job queue (Discogs sync, price refresh…). Portable across hosts. */
export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    status: jobStatus('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_jobs_pick_idx').on(t.status, t.runAfter)],
);

/** Per-user daily counters for metered features (e.g. photo recognition). */
export const usageCounters = pgTable(
  'usage_counters',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    day: date('day').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.day] })],
);

/** Accounts linked in external services (Discogs OAuth). Tokens are encrypted at rest. */
export const externalAccounts = pgTable(
  'external_accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    externalUserId: text('external_user_id'),
    externalUsername: text('external_username'),
    tokenEnc: text('token_enc').notNull(),
    secretEnc: text('secret_enc').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** In-flight OAuth 1.0a handshakes (request token → user → verifier). Short-lived. */
export const oauthRequests = pgTable('oauth_requests', {
  requestToken: text('request_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  secretEnc: text('secret_enc').notNull(),
  returnTo: text('return_to'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
