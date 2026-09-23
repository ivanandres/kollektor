import { sql, type SQL } from 'drizzle-orm';
import { likeEscape, type QueryToken } from './tokens';

/**
 * SQL fragments that test a single token against the fields of a release (aliased `r`)
 * and its album (aliased `a`). Case/accent-insensitive thanks to *_normalized columns.
 * Tokens of 4+ chars also match fuzzily (pg_trgm word similarity) to tolerate typos.
 */
export function textMatch(column: SQL, t: QueryToken): SQL {
  const like = `%${likeEscape(t.text)}%`;
  return t.text.length >= 4
    ? sql`(${column} LIKE ${like} OR ${t.text} <% ${column})`
    : sql`${column} LIKE ${like}`;
}

export const artistMatch = (t: QueryToken): SQL => sql`EXISTS (
  SELECT 1 FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id
  WHERE aa.album_id = a.id AND ${textMatch(sql`ar.name_normalized`, t)})`;

export const albumTitleMatch = (t: QueryToken): SQL => textMatch(sql`a.title_normalized`, t);

export const trackMatch = (t: QueryToken): SQL => sql`EXISTS (
  SELECT 1 FROM tracks tr WHERE tr.release_id = r.id AND ${textMatch(sql`tr.title_normalized`, t)})`;

export const editionMatch = (t: QueryToken): SQL => {
  const like = `%${likeEscape(t.text)}%`;
  const parts: SQL[] = [
    sql`EXISTS (SELECT 1 FROM release_labels rl JOIN labels lb ON lb.id = rl.label_id
      WHERE rl.release_id = r.id AND (lb.name_normalized LIKE ${like}
        OR rl.catalog_number_normalized LIKE ${`%${likeEscape(t.catno)}%`}))`,
    sql`lower(unaccent(coalesce(r.country, ''))) LIKE ${like}`,
    sql`coalesce(r.barcode, '') LIKE ${like}`,
  ];
  if (t.year != null) parts.push(sql`r.release_year = ${t.year}`);
  return sql`(${sql.join(parts, sql` OR `)})`;
};

export const genreStyleMatch = (t: QueryToken): SQL => {
  const like = `%${likeEscape(t.text)}%`;
  return sql`(EXISTS (SELECT 1 FROM album_genres ag JOIN genres g ON g.id = ag.genre_id
      WHERE ag.album_id = a.id AND lower(unaccent(g.name)) LIKE ${like})
    OR EXISTS (SELECT 1 FROM album_styles ast JOIN styles s ON s.id = ast.style_id
      WHERE ast.album_id = a.id AND lower(unaccent(s.name)) LIKE ${like}))`;
};

export const albumYearMatch = (t: QueryToken): SQL =>
  t.year != null ? sql`a.original_release_year = ${t.year}` : sql`false`;

/** A token matches an item if it matches any searchable field. */
export const anyFieldMatch = (t: QueryToken): SQL =>
  sql`(${sql.join(
    [
      artistMatch(t),
      albumTitleMatch(t),
      trackMatch(t),
      editionMatch(t),
      genreStyleMatch(t),
      albumYearMatch(t),
    ],
    sql` OR `,
  )})`;

/** Every token must match some field: "floyd money", "emi 1973", "pink dark side". */
export const allTokensMatch = (tokens: QueryToken[]): SQL =>
  tokens.length ? sql`(${sql.join(tokens.map(anyFieldMatch), sql` AND `)})` : sql`true`;
