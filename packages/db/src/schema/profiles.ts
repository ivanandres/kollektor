import { boolean, char, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { visibility } from './enums';

/** Public-facing profile + privacy settings. Everything is private by default. */
export const profiles = pgTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  username: text('username').notNull().unique(),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  profileVisibility: visibility('profile_visibility').notNull().default('private'),
  collectionVisibility: visibility('collection_visibility').notNull().default('private'),
  wishlistVisibility: visibility('wishlist_visibility').notNull().default('private'),
  showPrices: boolean('show_prices').notNull().default(false),
  showValues: boolean('show_values').notNull().default(false),
  baseCurrency: char('base_currency', { length: 3 }).notNull().default('USD'),
  locale: text('locale').notNull().default('es-AR'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
