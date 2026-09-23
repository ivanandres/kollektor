import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { notFound } from '../../lib/errors';
import { seedAchievements, seedEssentialLists } from '../../seed/seed';
import { criteriaSchema } from '../achievements/criteria';

export const essentialListInput = z.object({
  artist: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  albums: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(300),
        year: z.number().int().min(1877).max(2100),
        aliases: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const achievementPatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(300),
    icon: z.string().trim().min(1).max(40),
    isActive: z.boolean(),
    criteria: criteriaSchema,
  })
  .partial();

/** Curation of essential discographies and achievements (admin only, enforced by the API). */
export function adminService(deps: CoreDeps) {
  const { db } = deps;
  const { essentialLists, essentialListItems, albums, achievements } = schema;

  async function listEssentials() {
    const lists = await db.select().from(essentialLists).orderBy(asc(essentialLists.name));
    const items = await db
      .select({
        listId: essentialListItems.listId,
        title: albums.title,
        year: albums.originalReleaseYear,
        aliases: essentialListItems.aliases,
        position: essentialListItems.position,
      })
      .from(essentialListItems)
      .innerJoin(albums, eq(albums.id, essentialListItems.albumId))
      .orderBy(asc(essentialListItems.position));
    return lists.map((l) => ({
      code: l.code,
      name: l.name,
      version: l.version,
      albums: items
        .filter((i) => i.listId === l.id)
        .map(({ title, year, aliases }) => ({ title, year, aliases })),
    }));
  }

  /** Creates or replaces a list (and its "<Artist> Complete" achievement). Users are re-evaluated lazily. */
  async function upsertEssential(code: string, input: z.infer<typeof essentialListInput>) {
    const def = { code, ...input };
    // Marked as admin-owned so the repo seed never overwrites it on deploy.
    await seedEssentialLists(db, [def], { source: 'admin' });
    await seedAchievements(db, [def], { onlyLists: true });
    // Re-creating a previously deleted list reactivates its achievement.
    await db
      .update(achievements)
      .set({ isActive: true })
      .where(eq(achievements.code, `complete-${code}`));
    return (await listEssentials()).find((l) => l.code === code)!;
  }

  async function deleteEssential(code: string) {
    const deleted = await db
      .delete(essentialLists)
      .where(eq(essentialLists.code, code))
      .returning({ id: essentialLists.id });
    if (!deleted.length) throw notFound('Discografía');
    await db
      .update(achievements)
      .set({ isActive: false })
      .where(eq(achievements.code, `complete-${code}`));
  }

  async function listAchievements() {
    return db
      .select()
      .from(achievements)
      .orderBy(asc(achievements.category), asc(achievements.sortOrder));
  }

  async function updateAchievement(code: string, patch: z.infer<typeof achievementPatch>) {
    const [row] = await db
      .update(achievements)
      .set(patch)
      .where(eq(achievements.code, code))
      .returning();
    if (!row) throw notFound('Logro');
    return row;
  }

  return { listEssentials, upsertEssential, deleteEssential, listAchievements, updateAchievement };
}
