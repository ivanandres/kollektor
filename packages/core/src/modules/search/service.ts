import { sql, type SQL } from 'drizzle-orm';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { normalizeText } from '../../lib/normalize';
import { albumTitleMatch, artistMatch, editionMatch, textMatch } from './conditions';
import { tokenize, type QueryToken } from './tokens';

export interface SearchResults {
  query: string;
  artists: { id: string; name: string; itemCount: number }[];
  albums: {
    id: string;
    title: string;
    artist: string;
    year: number | null;
    coverImageUrl: string | null;
    itemCount: number;
    inWishlist: boolean;
  }[];
  releases: {
    id: string;
    albumTitle: string;
    artist: string;
    releaseYear: number | null;
    country: string | null;
    labels: string | null;
    catalogNumbers: string | null;
    formatSummary: string | null;
    collectionItemIds: string[];
  }[];
  tracks: {
    id: string;
    title: string;
    position: string | null;
    albumTitle: string;
    artist: string;
    releaseId: string;
    collectionItemId: string | null;
  }[];
}

/** Provider abstraction so Postgres can be swapped for Meilisearch/Typesense later. */
export interface SearchProvider {
  search(userId: string, q: string, limit: number): Promise<SearchResults>;
}

const ARTIST_DISPLAY = sql`(SELECT string_agg(ar2.name, ', ' ORDER BY aa2.position)
  FROM album_artists aa2 JOIN artists ar2 ON ar2.id = aa2.artist_id WHERE aa2.album_id = a.id)`;

const and = (parts: SQL[]) => sql.join(parts, sql` AND `);
const or = (parts: SQL[]) => sql`(${sql.join(parts, sql` OR `)})`;

/** Search scoped to the user's collection + wishlist, results grouped by entity type. */
export function postgresSearchProvider(deps: CoreDeps): SearchProvider {
  const { db } = deps;

  const scope = (userId: string) => sql`
    scope AS (
      SELECT ci.release_id, ci.id AS item_id, false AS wished
        FROM collection_items ci WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL
      UNION ALL
      SELECT coalesce(w.release_id, wa.main_release_id), NULL::uuid, true
        FROM wishlist_items w JOIN albums wa ON wa.id = w.album_id
       WHERE w.user_id = ${userId} AND w.status <> 'purchased'
    )`;

  return {
    async search(userId, q, limit) {
      const tokens = tokenize(q, nowOf(deps));
      const empty: SearchResults = { query: q, artists: [], albums: [], releases: [], tracks: [] };
      if (tokens.length === 0) return empty;
      const qn = normalizeText(q);
      const each = (f: (t: QueryToken) => SQL) => and(tokens.map(f));
      const some = (f: (t: QueryToken) => SQL) => or(tokens.map(f));

      const artistsQ = db.execute<{ id: string; name: string; item_count: number }>(sql`
        WITH ${scope(userId)}
        SELECT ar.id, ar.name, count(DISTINCT s.item_id)::int AS item_count
          FROM scope s
          JOIN releases r ON r.id = s.release_id
          JOIN album_artists aa ON aa.album_id = r.album_id
          JOIN artists ar ON ar.id = aa.artist_id
         WHERE ${each((t) => textMatch(sql`ar.name_normalized`, t))}
         GROUP BY ar.id
         ORDER BY (ar.name_normalized = ${qn}) DESC, similarity(ar.name_normalized, ${qn}) DESC, ar.sort_name
         LIMIT ${limit}`);

      const albumsQ = db.execute<{
        id: string;
        title: string;
        artist: string;
        year: number | null;
        cover_image_url: string | null;
        item_count: number;
        in_wishlist: boolean;
      }>(sql`
        WITH ${scope(userId)}
        SELECT a.id, a.title, ${ARTIST_DISPLAY} AS artist, a.original_release_year AS year,
               a.cover_image_url, count(DISTINCT s.item_id)::int AS item_count, bool_or(s.wished) AS in_wishlist
          FROM scope s
          JOIN releases r ON r.id = s.release_id
          JOIN albums a ON a.id = r.album_id
         WHERE ${each((t) => or([albumTitleMatch(t), artistMatch(t)]))}
         GROUP BY a.id
         -- Title matches first ("Love Supreme"), then albums by a matching artist ("Love — Forever Changes").
         ORDER BY (a.title_normalized = ${qn}) DESC, bool_or(${some(albumTitleMatch)}) DESC,
                  similarity(a.title_normalized, ${qn}) DESC, a.original_release_year NULLS LAST, a.title
         LIMIT ${limit}`);

      const releasesQ = db.execute<{
        id: string;
        album_title: string;
        artist: string;
        release_year: number | null;
        country: string | null;
        labels: string | null;
        catalog_numbers: string | null;
        format_summary: string | null;
        item_ids: string[];
      }>(sql`
        WITH ${scope(userId)}
        SELECT r.id, a.title AS album_title, ${ARTIST_DISPLAY} AS artist, r.release_year, r.country,
               (SELECT string_agg(DISTINCT lb.name, ', ') FROM release_labels rl JOIN labels lb ON lb.id = rl.label_id WHERE rl.release_id = r.id) AS labels,
               (SELECT string_agg(rl.catalog_number, ', ') FROM release_labels rl WHERE rl.release_id = r.id) AS catalog_numbers,
               r.format_summary,
               coalesce(array_agg(DISTINCT s.item_id) FILTER (WHERE s.item_id IS NOT NULL), '{}') AS item_ids
          FROM scope s
          JOIN releases r ON r.id = s.release_id
          JOIN albums a ON a.id = r.album_id
         WHERE ${each((t) => or([editionMatch(t), albumTitleMatch(t), artistMatch(t)]))}
           AND ${some(editionMatch)}
         GROUP BY r.id, a.id
         ORDER BY r.release_year NULLS LAST
         LIMIT ${limit}`);

      const tracksQ = db.execute<{
        id: string;
        title: string;
        position: string | null;
        album_title: string;
        artist: string;
        release_id: string;
        item_id: string | null;
      }>(sql`
        WITH ${scope(userId)},
        hits AS (
          SELECT DISTINCT ON (tr.id) tr.id, tr.title, tr.position, tr.release_id, r.album_id, s.item_id,
                 (tr.title_normalized = ${qn}) AS exact, similarity(tr.title_normalized, ${qn}) AS score
            FROM scope s
            JOIN releases r ON r.id = s.release_id
            JOIN albums a ON a.id = r.album_id
            JOIN tracks tr ON tr.release_id = r.id
           WHERE ${some((t) => textMatch(sql`tr.title_normalized`, t))}
             AND ${each((t) => or([textMatch(sql`tr.title_normalized`, t), artistMatch(t), albumTitleMatch(t)]))}
           ORDER BY tr.id, s.item_id NULLS LAST
        ),
        top AS (SELECT * FROM hits ORDER BY exact DESC, score DESC, title LIMIT ${limit})
        -- Presentation columns only for the final rows.
        SELECT top.id, top.title, top.position, a.title AS album_title, ${ARTIST_DISPLAY} AS artist,
               top.release_id, top.item_id
          FROM top JOIN albums a ON a.id = top.album_id
         ORDER BY top.exact DESC, top.score DESC, top.title`);

      const [artists, albums, releases, trackRows] = await Promise.all([
        artistsQ,
        albumsQ,
        releasesQ,
        tracksQ,
      ]);
      const tracks = trackRows;

      return {
        query: q,
        artists: artists.map((r) => ({ id: r.id, name: r.name, itemCount: r.item_count })),
        albums: albums.map((r) => ({
          id: r.id,
          title: r.title,
          artist: r.artist,
          year: r.year,
          coverImageUrl: r.cover_image_url,
          itemCount: r.item_count,
          inWishlist: r.in_wishlist,
        })),
        releases: releases.map((r) => ({
          id: r.id,
          albumTitle: r.album_title,
          artist: r.artist,
          releaseYear: r.release_year,
          country: r.country,
          labels: r.labels,
          catalogNumbers: r.catalog_numbers,
          formatSummary: r.format_summary,
          collectionItemIds: r.item_ids,
        })),
        tracks: tracks.map((r) => ({
          id: r.id,
          title: r.title,
          position: r.position,
          albumTitle: r.album_title,
          artist: r.artist,
          releaseId: r.release_id,
          collectionItemId: r.item_id,
        })),
      };
    },
  };
}
