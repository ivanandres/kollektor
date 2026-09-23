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
