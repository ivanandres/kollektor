import { sql } from 'drizzle-orm';
import type { CoreDeps } from '../../context';
import type { AchievementService } from '../achievements/service';

export type Insight =
  | {
      type: 'essential_almost_complete';
      listCode: string;
      artistId: string;
      artistName: string;
      owned: number;
      total: number;
      missing: { albumId: string; title: string; year: number | null }[];
      message: string;
    }
  | {
      type: 'essential_complete';
      listCode: string;
      artistName: string;
      total: number;
      message: string;
    }
  | { type: 'decades'; count: number; message: string }
  | {
      type: 'explore_artist';
      artistId: string;
      artistName: string;
      becauseOf: string;
      sharedStyles: string[];
      message: string;
    };

export function discoveryService(deps: CoreDeps, achievements: AchievementService) {
  const { db } = deps;

  async function insights(userId: string): Promise<Insight[]> {
    const out: Insight[] = [];
    const lists = await achievements.essentialProgress(userId);
    const started = lists
      .filter((l) => l.owned > 0)
      .sort((a, b) => a.total - a.owned - (b.total - b.owned));
    for (const l of started) {
      if (l.complete) {
        out.push({
          type: 'essential_complete',
          listCode: l.code,
          artistName: l.artistName,
          total: l.total,
          message: `Completaste los ${l.total} esenciales de ${l.artistName}.`,
        });
        continue;
      }
      const missing = l.total - l.owned;
      out.push({
        type: 'essential_almost_complete',
        listCode: l.code,
        artistId: l.artistId,
        artistName: l.artistName,
        owned: l.owned,
        total: l.total,
        missing: l.missing,
        message:
          missing === 1
            ? `Te falta 1 disco para completar ${l.artistName}.`
            : `Tenés ${l.owned} de los ${l.total} discos esenciales de ${l.artistName}.`,
      });
    }

    const [dec] = await db.execute<{ n: number }>(sql`
      SELECT count(DISTINCT (coalesce(a.original_release_year, r.release_year) / 10))::int AS n
        FROM collection_items ci JOIN releases r ON r.id = ci.release_id JOIN albums a ON a.id = r.album_id
       WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL`);
    if (dec && dec.n > 1)
      out.push({
        type: 'decades',
        count: dec.n,
        message: `Tu colección tiene discos de ${dec.n} décadas distintas.`,
      });

    out.push(...(await exploreArtists(userId)));
    return out;
  }

  /**
   * "Si te gusta X, quizás quieras explorar Y": artists in the shared catalog that share the most
   * styles with the user's top artists and that the user doesn't own yet.
   */
  async function exploreArtists(userId: string, limit = 5): Promise<Insight[]> {
    const rows = await db.execute<{
      artist_id: string;
      artist_name: string;
      because_of: string;
      shared: string[];
    }>(sql`
      WITH mine AS (
        SELECT aa.artist_id, count(DISTINCT ci.id) AS n
          FROM collection_items ci JOIN releases r ON r.id = ci.release_id JOIN album_artists aa ON aa.album_id = r.album_id
         WHERE ci.user_id = ${userId} AND ci.deleted_at IS NULL GROUP BY aa.artist_id
      ), top AS (SELECT artist_id FROM mine ORDER BY n DESC LIMIT 3),
      top_styles AS (
        SELECT DISTINCT t.artist_id, ast.style_id FROM top t
          JOIN album_artists aa ON aa.artist_id = t.artist_id JOIN album_styles ast ON ast.album_id = aa.album_id
      ), candidates AS (
        SELECT aa.artist_id AS candidate, ts.artist_id AS source, array_agg(DISTINCT s.name) AS shared, count(DISTINCT ts.style_id) AS score
          FROM top_styles ts JOIN album_styles ast ON ast.style_id = ts.style_id
          JOIN albums al ON al.id = ast.album_id AND al.created_by_user_id IS NULL
          JOIN album_artists aa ON aa.album_id = al.id JOIN styles s ON s.id = ts.style_id
         WHERE aa.artist_id NOT IN (SELECT artist_id FROM mine)
         GROUP BY aa.artist_id, ts.artist_id
      )
      SELECT DISTINCT ON (c.candidate) c.candidate AS artist_id, ca.name AS artist_name, sa.name AS because_of, c.shared
        FROM candidates c JOIN artists ca ON ca.id = c.candidate JOIN artists sa ON sa.id = c.source
       ORDER BY c.candidate, c.score DESC`);
    return [...rows]
      .sort((a, b) => b.shared.length - a.shared.length)
      .slice(0, limit)
      .map((r) => ({
        type: 'explore_artist' as const,
        artistId: r.artist_id,
        artistName: r.artist_name,
        becauseOf: r.because_of,
        sharedStyles: r.shared,
        message: `Si te gusta ${r.because_of}, quizás quieras explorar ${r.artist_name}.`,
      }));
  }

  return { insights, exploreArtists };
}

export type DiscoveryService = ReturnType<typeof discoveryService>;
