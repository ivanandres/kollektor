import { pgEnum } from 'drizzle-orm/pg-core';

export const visibility = pgEnum('visibility', ['private', 'public']);

export const editionType = pgEnum('edition_type', [
  'original',
  'reissue',
  'remaster',
  'limited',
  'promo',
  'bootleg',
  'compilation',
  'other',
]);

/** Goldmine grading scale, as used by Discogs. */
export const grade = pgEnum('grade', ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P']);

export const wishlistStatus = pgEnum('wishlist_status', [
  'wanted',
  'searching',
  'found',
  'purchased',
]);

export const entityType = pgEnum('entity_type', ['artist', 'album', 'release', 'label', 'track']);

export const imageKind = pgEnum('image_kind', ['primary', 'secondary', 'user']);

export const linkStatus = pgEnum('link_status', ['found', 'not_found']);

export const priceKind = pgEnum('price_kind', ['suggestion', 'lowest', 'median', 'manual']);

export const jobStatus = pgEnum('job_status', ['pending', 'running', 'done', 'failed']);
