import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth';
import { albums, artists } from './catalog';

export const achievements = pgTable('achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  icon: text('icon').notNull(),
  category: text('category').notNull(),
  tier: smallint('tier').notNull().default(1),
  criteria: jsonb('criteria').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: smallint('sort_order').notNull().default(0),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    achievementId: uuid('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementId] })],
);

/** Curated "essential discography" of an artist, used by completion achievements. */
export const essentialLists = pgTable('essential_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  artistId: uuid('artist_id')
    .notNull()
    .references(() => artists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  version: smallint('version').notNull().default(1),
  source: text('source').notNull().default('curated'),
});

export const essentialListItems = pgTable(
  'essential_list_items',
  {
    listId: uuid('list_id')
      .notNull()
      .references(() => essentialLists.id, { onDelete: 'cascade' }),
    albumId: uuid('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull().default(0),
    /** Extra normalized titles that count as this album ("untitled" for Led Zeppelin IV…). */
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.albumId] }),
    index('essential_list_items_album_idx').on(t.albumId),
  ],
);
