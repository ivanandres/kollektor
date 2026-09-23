import { and, eq, isNull } from 'drizzle-orm';
import { schema, type Database } from '@kollektor/db';
import { normalizeText } from '../lib/normalize';
import * as repo from '../modules/catalog/repository';
import { ACHIEVEMENTS } from './achievements';
import { ESSENTIAL_LISTS, type EssentialListDef } from './essential-lists';

/**
 * Creates missing achievements only: once a row exists, the admin API owns it (edits and
 * deactivations survive re-seeding on deploy). Change existing definitions via /api/admin.
 */
export async function seedAchievements(
  db: Database,
  lists: EssentialListDef[] = ESSENTIAL_LISTS,
  opts: { onlyLists?: boolean } = {},
) {
  const defs = [
    ...(opts.onlyLists ? [] : ACHIEVEMENTS.map((a, i) => ({ ...a, sortOrder: i }))),
    ...lists.map((l, i) => ({
      code: `complete-${l.code}`,
      name: `${l.artist} Complete`,
      description: `Tenés todos los discos esenciales de ${l.artist}.`,
      icon: 'trophy',
      category: 'discografias' as const,
      tier: 2,
      criteria: { type: 'essential_list' as const, listCode: l.code },
      sortOrder: 100 + i,
    })),
  ];
  for (const values of defs) {
    await db
      .insert(schema.achievements)
      .values(values)
      .onConflictDoNothing({ target: schema.achievements.code });
  }
  return defs.length;
}

/** Creates (or reuses) shared artist/album rows for each curated list. Idempotent. */
export async function seedEssentialLists(
  db: Database,
  lists: EssentialListDef[] = ESSENTIAL_LISTS,
  opts: { source?: 'curated' | 'admin' } = {},
) {
  const source = opts.source ?? 'curated';
  for (const def of lists) {
    // Lists edited through the admin API are never overwritten by the repo seed.
    const [current] = await db
      .select({ source: schema.essentialLists.source })
      .from(schema.essentialLists)
      .where(eq(schema.essentialLists.code, def.code));
    if (current?.source === 'admin' && source !== 'admin') continue;
    await db.transaction(async (tx) => {
      const [artist] = await tx
        .select({ id: schema.artists.id })
        .from(schema.artists)
        .where(
          and(
            eq(schema.artists.nameNormalized, normalizeText(def.artist)),
            isNull(schema.artists.createdByUserId),
          ),
        )
        .limit(1);
      const artistId = artist?.id ?? (await repo.insertArtist(tx, def.artist, null));
      const [existing] = await tx
        .select()
        .from(schema.essentialLists)
        .where(eq(schema.essentialLists.code, def.code));
      const listId =
        existing?.id ??
        (
          await tx
            .insert(schema.essentialLists)
            .values({ code: def.code, artistId, name: def.name, source })
            .returning()
        )[0]!.id;
      if (existing)
        await tx
          .update(schema.essentialLists)
          .set({ name: def.name, source, artistId })
          .where(eq(schema.essentialLists.id, listId));
      await tx
        .delete(schema.essentialListItems)
        .where(eq(schema.essentialListItems.listId, listId));
      for (const [position, album] of def.albums.entries()) {
        const [found] = await tx
          .select({ id: schema.albums.id })
          .from(schema.albums)
          .innerJoin(schema.albumArtists, eq(schema.albumArtists.albumId, schema.albums.id))
          .where(
            and(
              eq(schema.albums.titleNormalized, normalizeText(album.title)),
              eq(schema.albumArtists.artistId, artistId),
              isNull(schema.albums.createdByUserId),
            ),
          )
          .limit(1);
        const albumId =
          found?.id ??
          (await repo.insertAlbum(
            tx,
            { title: album.title, originalReleaseYear: album.year, createdByUserId: null },
            [{ artistId }],
          ));
        await tx.insert(schema.essentialListItems).values({
          listId,
          albumId,
          position,
          aliases: (album.aliases ?? []).map(normalizeText),
        });
      }
    });
  }
  return lists.length;
}

export async function seedAll(db: Database) {
  const lists = await seedEssentialLists(db);
  const achievements = await seedAchievements(db);
  return { lists, achievements };
}
