import { and, asc, eq, inArray } from 'drizzle-orm';
import { sql, type SQL } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { recordActivity } from '../activity/service';
import { criteriaSchema, type Criteria } from './criteria';

const { achievements, userAchievements, essentialLists } = schema;

const FROM = sql`FROM collection_items ci JOIN releases r ON r.id = ci.release_id JOIN albums a ON a.id = r.album_id`;

export interface EssentialListProgress {
  listId: string;
  code: string;
  name: string;
  artistId: string;
  artistName: string;
  total: number;
  owned: number;
  missing: { albumId: string; title: string; year: number | null }[];
  complete: boolean;
}

export interface AchievementProgress {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: number;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number };
}

export function achievementService(deps: CoreDeps) {
  const { db } = deps;
  const mine = (userId: string) => sql`ci.user_id = ${userId} AND ci.deleted_at IS NULL`;

  async function distinctCount(userId: string, field: string): Promise<number> {
    const expr: Record<string, [SQL, SQL]> = {
      artist: [sql`aa.artist_id`, sql`JOIN album_artists aa ON aa.album_id = a.id`],
      genre: [sql`ag.genre_id`, sql`JOIN album_genres ag ON ag.album_id = a.id`],
      style: [sql`ast.style_id`, sql`JOIN album_styles ast ON ast.album_id = a.id`],
      decade: [sql`(coalesce(a.original_release_year, r.release_year) / 10)`, sql``],
      country: [sql`r.country`, sql``],
      label: [sql`rl.label_id`, sql`JOIN release_labels rl ON rl.release_id = r.id`],
    };
    const [col, join] = expr[field]!;
    const [row] = await db.execute<{ n: number }>(
      sql`SELECT count(DISTINCT ${col})::int AS n ${FROM} ${join} WHERE ${mine(userId)}`,
    );
    return row?.n ?? 0;
  }

  async function matchingReleaseCount(
    userId: string,
    where: Extract<Criteria, { type: 'has_release' }>['where'],
  ): Promise<number> {
    const ors: SQL[] = [];
    const arr = (v: string[]) => sql`ARRAY[${sql.join(v.map((x) => sql`${x}`), sql`, `)}]::text[]`;
    if (where.country) ors.push(sql`r.country = ANY(${arr(where.country)})`);
    if (where.editionType) ors.push(sql`r.edition_type::text = ANY(${arr(where.editionType)})`);
    if (where.formatDescription)
      ors.push(sql`EXISTS (SELECT 1 FROM release_formats rf WHERE rf.release_id = r.id AND rf.descriptions && ${arr(where.formatDescription)})`);
    if (where.firstPressing)
      ors.push(sql`(ci.is_first_pressing IS TRUE OR (ci.is_first_pressing IS NULL AND r.edition_type = 'original'))`);
    if (where.coloredVinyl)
      ors.push(sql`EXISTS (SELECT 1 FROM release_formats rf WHERE rf.release_id = r.id AND rf.name = 'Vinyl' AND rf.color IS NOT NULL AND lower(rf.color) NOT LIKE '%black%')`);
    const [row] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n ${FROM} WHERE ${mine(userId)} AND (${sql.join(ors, sql` OR `)})`,
    );
    return row?.n ?? 0;
  }

  /**
   * Progress on curated "essential" discographies. An album counts as owned if the user has
   * any edition of it — matched by id, or by normalized title (or alias) + shared artist name,
   * so private manual entries and Discogs imports of the same album both count.
   */
  async function essentialProgress(userId: string, codes?: string[]): Promise<EssentialListProgress[]> {
    const rows = await db.execute<{
      list_id: string; code: string; name: string; artist_id: string; artist_name: string;
      album_id: string; title: string; year: number | null; owned: boolean;
    }>(sql`
      WITH owned AS (
        SELECT DISTINCT a.id AS album_id, a.title_normalized, ar.name_normalized AS artist_norm
          ${FROM} JOIN album_artists aa ON aa.album_id = a.id JOIN artists ar ON ar.id = aa.artist_id
         WHERE ${mine(userId)}
      )
      SELECT el.id AS list_id, el.code, el.name, el.artist_id, lar.name AS artist_name,
             ea.id AS album_id, ea.title, ea.original_release_year AS year,
             EXISTS (
               SELECT 1 FROM owned o
                WHERE o.album_id = ea.id
                   OR (o.artist_norm = lar.name_normalized
                       AND (o.title_normalized = ea.title_normalized OR o.title_normalized = ANY(eli.aliases)))
             ) AS owned
        FROM essential_lists el
        JOIN artists lar ON lar.id = el.artist_id
        JOIN essential_list_items eli ON eli.list_id = el.id
        JOIN albums ea ON ea.id = eli.album_id
       ${codes ? sql`WHERE el.code = ANY(ARRAY[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])` : sql``}
       ORDER BY el.name, eli.position`);
    const byList = new Map<string, EssentialListProgress>();
    for (const r of rows) {
      let l = byList.get(r.list_id);
      if (!l) {
        l = { listId: r.list_id, code: r.code, name: r.name, artistId: r.artist_id, artistName: r.artist_name, total: 0, owned: 0, missing: [], complete: false };
        byList.set(r.list_id, l);
      }
      l.total++;
      if (r.owned) l.owned++;
      else l.missing.push({ albumId: r.album_id, title: r.title, year: r.year });
    }
    for (const l of byList.values()) l.complete = l.total > 0 && l.owned === l.total;
    return [...byList.values()];
  }

  async function measure(userId: string, c: Criteria, ctx: { count?: number; essentials?: EssentialListProgress[] }) {
    switch (c.type) {
      case 'count': {
        if (ctx.count == null) {
          const [row] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM collection_items ci WHERE ${mine(userId)}`);
          ctx.count = row?.n ?? 0;
        }
        return { current: ctx.count, target: c.min };
      }
      case 'distinct':
        return { current: await distinctCount(userId, c.field), target: c.min };
      case 'has_release':
        return { current: await matchingReleaseCount(userId, c.where), target: c.min };
      case 'essential_list': {
        ctx.essentials ??= await essentialProgress(userId);
        const l = ctx.essentials.find((x) => x.code === c.listCode);
        return { current: l?.owned ?? 0, target: l?.total ?? 1 };
      }
      case 'essential_lists_completed': {
        ctx.essentials ??= await essentialProgress(userId);
        return { current: ctx.essentials.filter((l) => l.complete).length, target: c.min };
      }
    }
  }

  async function listWithProgress(userId: string): Promise<AchievementProgress[]> {
    const [all, unlocked] = await Promise.all([
      db.select().from(achievements).where(eq(achievements.isActive, true)).orderBy(asc(achievements.category), asc(achievements.sortOrder)),
      db.select().from(userAchievements).where(eq(userAchievements.userId, userId)),
    ]);
    const unlockedAt = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
    const ctx = {};
    const out: AchievementProgress[] = [];
    for (const a of all) {
      const parsed = criteriaSchema.safeParse(a.criteria);
      if (!parsed.success) continue;
      const p = await measure(userId, parsed.data, ctx);
      const at = unlockedAt.get(a.id);
      out.push({
        code: a.code,
        name: a.name,
        description: a.description,
        icon: a.icon,
        category: a.category,
        tier: a.tier,
        unlocked: at != null,
        unlockedAt: at?.toISOString() ?? null,
        progress: { current: Math.min(p.current, p.target), target: p.target },
      });
    }
    return out;
  }

  /**
   * Evaluates locked achievements and unlocks the ones reached. Unlocked achievements are
   * never revoked (removing records keeps the badge). Returns the newly unlocked codes.
   */
  async function evaluate(userId: string): Promise<string[]> {
    const [all, unlocked] = await Promise.all([
      db.select().from(achievements).where(eq(achievements.isActive, true)),
      db.select({ id: userAchievements.achievementId }).from(userAchievements).where(eq(userAchievements.userId, userId)),
    ]);
    const done = new Set(unlocked.map((u) => u.id));
    const ctx = {};
    const newly: typeof all = [];
    for (const a of all) {
      if (done.has(a.id)) continue;
      const parsed = criteriaSchema.safeParse(a.criteria);
      if (!parsed.success) continue;
      const p = await measure(userId, parsed.data, ctx);
      if (p.current >= p.target) newly.push(a);
    }
    if (newly.length === 0) return [];
    const unlockedAt = nowOf(deps);
    const inserted = await db
      .insert(userAchievements)
      .values(newly.map((a) => ({ userId, achievementId: a.id, unlockedAt })))
      .onConflictDoNothing()
      .returning({ id: userAchievements.achievementId });
    const codes = newly.filter((a) => inserted.some((i) => i.id === a.id));
    for (const a of codes)
      await recordActivity(db, { userId, type: 'achievement.unlocked', subjectType: 'achievement', subjectId: a.id, payload: { code: a.code } });
    return codes.map((a) => a.code);
  }

  async function getByCodes(codes: string[]) {
    if (!codes.length) return [];
    return db
      .select({ code: achievements.code, name: achievements.name, description: achievements.description, icon: achievements.icon })
      .from(achievements)
      .where(and(inArray(achievements.code, codes)));
  }

  return { evaluate, listWithProgress, essentialProgress, getByCodes, lists: () => db.select().from(essentialLists) };
}

export type AchievementService = ReturnType<typeof achievementService>;
