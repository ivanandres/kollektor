import { sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { Db } from '../../context';

export type ActivityType =
  | 'collection.added'
  | 'collection.updated'
  | 'collection.removed'
  | 'wishlist.added'
  | 'wishlist.purchased'
  | 'achievement.unlocked';

export async function recordActivity(
  db: Db,
  e: {
    userId: string;
    type: ActivityType;
    subjectType: 'collection_item' | 'wishlist_item' | 'achievement';
    subjectId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(schema.activityEvents).values({
    userId: e.userId,
    type: e.type,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    payload: e.payload ?? null,
  });
}

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  createdAt: string;
  message: string;
  title: string | null;
  artist: string | null;
  coverImageUrl: string | null;
  collectionItemId: string | null;
  achievement: { code: string; name: string; icon: string } | null;
}

/** The user's own timeline ("Tu actividad"), newest first, with ready-to-show messages. */
export async function listActivity(
  db: Db,
  userId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<ActivityEntry[]> {
  const limit = Math.min(opts.limit ?? 30, 100);
  const rows = await db.execute<{
    id: string;
    type: ActivityType;
    created_at: Date;
    subject_id: string;
    title: string | null;
    artist: string | null;
    cover: string | null;
    item_id: string | null;
    ach_code: string | null;
    ach_name: string | null;
    ach_icon: string | null;
  }>(sql`
    SELECT e.id, e.type, e.created_at, e.subject_id,
           a.title, (SELECT string_agg(ar.name, ', ' ORDER BY aa.position) FROM album_artists aa
                      JOIN artists ar ON ar.id = aa.artist_id WHERE aa.album_id = a.id) AS artist,
           a.cover_image_url AS cover,
           CASE WHEN e.subject_type = 'collection_item' THEN e.subject_id END AS item_id,
           ach.code AS ach_code, ach.name AS ach_name, ach.icon AS ach_icon
      FROM activity_events e
      LEFT JOIN collection_items ci ON e.subject_type = 'collection_item' AND ci.id = e.subject_id
      LEFT JOIN wishlist_items wi ON e.subject_type = 'wishlist_item' AND wi.id = e.subject_id
      LEFT JOIN releases r ON r.id = ci.release_id
      LEFT JOIN albums a ON a.id = coalesce(r.album_id, wi.album_id)
      LEFT JOIN achievements ach ON e.subject_type = 'achievement' AND ach.id = e.subject_id
     WHERE e.user_id = ${userId}
       ${opts.before ? sql`AND e.created_at < ${opts.before}::timestamptz` : sql``}
     ORDER BY e.created_at DESC, e.id
     LIMIT ${limit}`);
  const what = (r: (typeof rows)[number]) =>
    r.title ? `${r.title}${r.artist ? ` — ${r.artist}` : ''}` : 'un disco';
  const message = (r: (typeof rows)[number]) => {
    switch (r.type) {
      case 'collection.added':
        return `Agregaste ${what(r)} a tu colección.`;
      case 'collection.removed':
        return `Quitaste ${what(r)} de tu colección.`;
      case 'collection.updated':
        return `Actualizaste ${what(r)}.`;
      case 'wishlist.added':
        return `Sumaste ${what(r)} a tu wishlist.`;
      case 'wishlist.purchased':
        return `Conseguiste ${what(r)} de tu wishlist.`;
      case 'achievement.unlocked':
        return `Desbloqueaste «${r.ach_name ?? 'un logro'}».`;
    }
  };
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    createdAt: new Date(r.created_at).toISOString(),
    message: message(r),
    title: r.title,
    artist: r.artist,
    coverImageUrl: r.cover,
    collectionItemId: r.item_id,
    achievement: r.ach_code ? { code: r.ach_code, name: r.ach_name!, icon: r.ach_icon! } : null,
  }));
}
