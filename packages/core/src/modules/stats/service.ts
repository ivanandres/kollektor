import { and, asc, eq } from 'drizzle-orm';
import { sql, type SQL } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';

const FROM = sql`FROM collection_items ci JOIN releases r ON r.id = ci.release_id JOIN albums a ON a.id = r.album_id`;
const ALBUM_YEAR = sql`coalesce(a.original_release_year, r.release_year)`;
const ARTIST_DISPLAY = sql`(SELECT string_agg(ar.name, ', ' ORDER BY aa.position)
  FROM album_artists aa JOIN artists ar ON ar.id = aa.artist_id WHERE aa.album_id = a.id)`;

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export function statsService(deps: CoreDeps) {
  const { db } = deps;
  const mine = (userId: string) => sql`ci.user_id = ${userId} AND ci.deleted_at IS NULL`;

  async function currencyOf(userId: string) {
    const [p] = await db
      .select({ c: schema.profiles.baseCurrency })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));
    return p?.c ?? 'USD';
  }

  async function summary(userId: string) {
    const [t] = await db.execute<{
      items: number;
      albums: number;
      releases: number;
      artists: number;
      invested: string | null;
      estimated: string | null;
      priced: number;
      valued: number;
      avg_paid: string | null;
      avg_estimated: string | null;
    }>(sql`
      SELECT count(*)::int AS items,
             count(DISTINCT a.id)::int AS albums,
             count(DISTINCT r.id)::int AS releases,
             (SELECT count(DISTINCT aa.artist_id)::int FROM collection_items ci
                JOIN releases r ON r.id = ci.release_id JOIN album_artists aa ON aa.album_id = r.album_id
               WHERE ${mine(userId)}) AS artists,
             sum(ci.purchase_price_base) AS invested,
             sum(ci.estimated_value_base) AS estimated,
             count(ci.purchase_price_base)::int AS priced,
             count(ci.estimated_value_base)::int AS valued,
             avg(ci.purchase_price_base) AS avg_paid,
             avg(ci.estimated_value_base) AS avg_estimated
        ${FROM} WHERE ${mine(userId)}`);
    const invested = num(t?.invested) ?? 0;
    const estimated = num(t?.estimated) ?? 0;
    return {
      currency: await currencyOf(userId),
      items: t?.items ?? 0,
      artists: t?.artists ?? 0,
      albums: t?.albums ?? 0,
      releases: t?.releases ?? 0,
      invested,
      estimated,
      difference: Math.round((estimated - invested) * 100) / 100,
      itemsWithPrice: t?.priced ?? 0,
      itemsWithValue: t?.valued ?? 0,
      averagePaid: num(t?.avg_paid),
      averageEstimated: num(t?.avg_estimated),
      disclaimer: 'Valor estimado: no es una tasación garantizada.',
    };
  }

  async function bucket(
    userId: string,
    key: SQL,
    join: SQL = sql``,
    limit = 50,
  ): Promise<Bucket[]> {
    const rows = await db.execute<{ key: string; count: number }>(sql`
      SELECT ${key} AS key, count(DISTINCT ci.id)::int AS count ${FROM} ${join}
       WHERE ${mine(userId)} AND ${key} IS NOT NULL
       GROUP BY 1 ORDER BY count DESC, 1 LIMIT ${limit}`);
    return rows.map((r) => ({ key: String(r.key), label: String(r.key), count: r.count }));
  }

  async function breakdowns(userId: string, limit = 20) {
    const [
      byArtist,
      byGenre,
      byStyle,
      byDecade,
      byYear,
      byCountry,
      byLabel,
      byFormat,
      byCondition,
      byEditionType,
    ] = await Promise.all([
      db
        .execute<{ key: string; label: string; count: number }>(
          sql`
            SELECT ar.id AS key, ar.name AS label, count(DISTINCT ci.id)::int AS count ${FROM}
              JOIN album_artists aa ON aa.album_id = a.id JOIN artists ar ON ar.id = aa.artist_id
             WHERE ${mine(userId)} GROUP BY ar.id ORDER BY count DESC, ar.sort_name LIMIT ${limit}`,
        )
        .then((rows) => rows.map((r) => ({ ...r }))),
      bucket(
        userId,
        sql`g.name`,
        sql`JOIN album_genres ag ON ag.album_id = a.id JOIN genres g ON g.id = ag.genre_id`,
        limit,
      ),
      bucket(
        userId,
        sql`s.name`,
        sql`JOIN album_styles ast ON ast.album_id = a.id JOIN styles s ON s.id = ast.style_id`,
        limit,
      ),
      db
        .execute<{ key: number; count: number }>(
          sql`
            SELECT ((${ALBUM_YEAR} / 10) * 10)::int AS key, count(*)::int AS count ${FROM}
             WHERE ${mine(userId)} AND ${ALBUM_YEAR} IS NOT NULL GROUP BY 1 ORDER BY 1`,
        )
        .then((rows) =>
          rows.map((r) => ({ key: String(r.key), label: `${r.key}s`, count: r.count })),
        ),
      db
        .execute<{ key: number; count: number }>(
          sql`
            SELECT ${ALBUM_YEAR}::int AS key, count(*)::int AS count ${FROM}
             WHERE ${mine(userId)} AND ${ALBUM_YEAR} IS NOT NULL GROUP BY 1 ORDER BY 1`,
        )
        .then((rows) =>
          rows.map((r) => ({ key: String(r.key), label: String(r.key), count: r.count })),
        ),
      bucket(userId, sql`r.country`, sql``, limit),
      bucket(
        userId,
        sql`lb.name`,
        sql`JOIN release_labels rl ON rl.release_id = r.id JOIN labels lb ON lb.id = rl.label_id`,
        limit,
      ),
      bucket(
        userId,
        sql`coalesce(rf.size, rf.name)`,
        sql`JOIN release_formats rf ON rf.release_id = r.id`,
        limit,
      ),
      bucket(userId, sql`ci.condition_media::text`),
      bucket(userId, sql`r.edition_type::text`),
    ]);
    return {
      byArtist,
      byGenre,
      byStyle,
      byDecade,
      byYear,
      byCountry,
      byLabel,
      byFormat,
      byCondition,
      byEditionType,
    };
  }

  /** "Tu colección en números". */
  async function highlights(userId: string) {
    const item = (order: SQL, where: SQL = sql`true`) =>
      db
        .execute<{
          id: string;
          title: string;
          artist: string;
          release_year: number | null;
          paid: string | null;
          value: string | null;
          created_at: Date;
        }>(
          sql`
          SELECT ci.id, a.title, ${ARTIST_DISPLAY} AS artist, r.release_year,
                 ci.purchase_price_base AS paid, ci.estimated_value_base AS value, ci.created_at
            ${FROM} WHERE ${mine(userId)} AND ${where} ORDER BY ${order} LIMIT 1`,
        )
        .then((rows) => {
          const r = rows[0];
          return r
            ? {
                collectionItemId: r.id,
                title: r.title,
                artist: r.artist,
                releaseYear: r.release_year,
                paid: num(r.paid),
                estimatedValue: num(r.value),
                addedAt: new Date(r.created_at).toISOString(),
              }
            : null;
        });
    const b = await breakdowns(userId, 1);
    const [oldestEdition, mostValuable, biggestPurchase, latestAddition] = await Promise.all([
      item(sql`r.release_year ASC`, sql`r.release_year IS NOT NULL`),
      item(sql`ci.estimated_value_base DESC`, sql`ci.estimated_value_base IS NOT NULL`),
      item(sql`ci.purchase_price_base DESC`, sql`ci.purchase_price_base IS NOT NULL`),
      item(sql`ci.created_at DESC`),
    ]);
    const topDecade = [...b.byDecade].sort((x, y) => y.count - x.count)[0] ?? null;
    return {
      topArtist: b.byArtist[0] ?? null,
      topGenre: b.byGenre[0] ?? null,
      topDecade,
      oldestEdition,
      mostValuable,
      biggestPurchase,
      latestAddition,
    };
  }

  /** Items added per month and spend per year/month (purchase date, falling back to added date). */
  async function timeline(userId: string) {
    const when = sql`coalesce(ci.purchase_date, ci.created_at::date)`;
    const [addedPerMonth, spendPerYear, spendPerMonth] = await Promise.all([
      db.execute<{ month: string; count: number }>(sql`
        SELECT to_char(date_trunc('month', ci.created_at), 'YYYY-MM') AS month, count(*)::int AS count
          FROM collection_items ci WHERE ${mine(userId)} GROUP BY 1 ORDER BY 1`),
      db.execute<{ year: number; total: string; purchases: number; average: string }>(sql`
        SELECT extract(year FROM ${when})::int AS year, sum(ci.purchase_price_base) AS total,
               count(*)::int AS purchases, avg(ci.purchase_price_base) AS average
          FROM collection_items ci WHERE ${mine(userId)} AND ci.purchase_price_base IS NOT NULL GROUP BY 1 ORDER BY 1`),
      db.execute<{ month: string; total: string; purchases: number }>(sql`
        SELECT to_char(${when}, 'YYYY-MM') AS month, sum(ci.purchase_price_base) AS total, count(*)::int AS purchases
          FROM collection_items ci WHERE ${mine(userId)} AND ci.purchase_price_base IS NOT NULL GROUP BY 1 ORDER BY 1`),
    ]);
    const months = spendPerMonth.map((m) => ({
      month: m.month,
      total: Number(m.total),
      purchases: m.purchases,
    }));
    const valueHistory = await db
      .select()
      .from(schema.collectionValueSnapshots)
      .where(and(eq(schema.collectionValueSnapshots.userId, userId)))
      .orderBy(asc(schema.collectionValueSnapshots.capturedOn));
    return {
      currency: await currencyOf(userId),
      addedPerMonth: [...addedPerMonth],
      spendPerYear: spendPerYear.map((y) => ({
        year: y.year,
        total: Number(y.total),
        purchases: y.purchases,
        average: Number(y.average),
      })),
      spendPerMonth: months,
      topSpendingMonth: [...months].sort((x, y) => y.total - x.total)[0] ?? null,
      valueHistory: valueHistory.map((v) => ({
        date: v.capturedOn,
        items: v.itemCount,
        invested: v.totalInvested,
        estimated: v.totalEstimated,
        currency: v.currency,
      })),
    };
  }

  async function dashboard(userId: string) {
    const [s, h, b] = await Promise.all([
      summary(userId),
      highlights(userId),
      breakdowns(userId, 8),
    ]);
    return { summary: s, highlights: h, charts: b };
  }

  return { summary, breakdowns, highlights, timeline, dashboard };
}

export type StatsService = ReturnType<typeof statsService>;
