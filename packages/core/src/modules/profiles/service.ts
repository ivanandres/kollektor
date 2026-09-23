import { eq, sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { ProfileUpdateInput } from '@kollektor/schemas';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { conflict, notFound } from '../../lib/errors';
import { normalizeText } from '../../lib/normalize';

const { profiles, user } = schema;

export type Profile = typeof profiles.$inferSelect;

export function profileService(
  deps: CoreDeps,
  hooks: { onBaseCurrencyChanged?: (userId: string) => Promise<void> } = {},
) {
  const { db } = deps;

  async function isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
    const [row] = await db
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.username, username));
    return !row || row.userId === exceptUserId;
  }

  /** Derive a free username from a name/email: "Iván Andrés" → "ivan_andres", then "ivan_andres2"… */
  async function suggestUsername(seed: string): Promise<string> {
    const base =
      normalizeText(seed.split('@')[0] ?? seed)
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'coleccionista';
    const padded = base.length < 3 ? `${base}_vinyl` : base;
    for (let i = 0; i < 1000; i++) {
      const candidate = i === 0 ? padded : `${padded}${i + 1}`;
      if (await isUsernameAvailable(candidate)) return candidate;
    }
    return `${padded}_${crypto.randomUUID().slice(0, 6)}`;
  }

  /** Called right after sign-up. Idempotent. */
  async function ensureProfile(userId: string): Promise<Profile> {
    const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
    if (existing) return existing;
    const [u] = await db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, userId));
    if (!u) throw notFound('Usuario');
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = await suggestUsername(u.name || u.email);
      try {
        const [created] = await db
          .insert(profiles)
          .values({ userId, username, displayName: u.name || null })
          .onConflictDoNothing({ target: profiles.userId })
          .returning();
        return created ?? (await db.select().from(profiles).where(eq(profiles.userId, userId)))[0]!;
      } catch (e) {
        // Username taken by a concurrent sign-up: pick another one.
        if (attempt === 4) throw e;
      }
    }
    throw conflict('No se pudo crear el perfil');
  }

  async function getProfile(userId: string): Promise<Profile> {
    return ensureProfile(userId);
  }

  async function updateProfile(userId: string, input: ProfileUpdateInput): Promise<Profile> {
    const current = await ensureProfile(userId);
    if (input.username && !(await isUsernameAvailable(input.username, userId)))
      throw conflict('Ese nombre de usuario ya está en uso');
    const [updated] = await db
      .update(profiles)
      .set({ ...input, updatedAt: nowOf(deps) })
      .where(eq(profiles.userId, userId))
      .returning();
    if (input.baseCurrency && input.baseCurrency !== current.baseCurrency)
      await hooks.onBaseCurrencyChanged?.(userId);
    return updated!;
  }

  /** Resolves a public profile to its owner id, only when the requested section is public. */
  async function publicOwner(username: string, section: 'profile' | 'collection' | 'wishlist') {
    const [p] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, username.toLowerCase()));
    if (!p || p.profileVisibility !== 'public') throw notFound('Perfil');
    if (section === 'collection' && p.collectionVisibility !== 'public')
      throw notFound('Colección');
    if (section === 'wishlist' && p.wishlistVisibility !== 'public') throw notFound('Wishlist');
    return p;
  }

  /** Public URLs of files the user uploaded (avatar, photos of their copies), for account deletion. */
  async function uploadedFileUrls(userId: string): Promise<string[]> {
    const rows = await db.execute<{ url: string }>(sql`
      SELECT avatar_url AS url FROM profiles WHERE user_id = ${userId} AND avatar_url IS NOT NULL
      UNION ALL
      SELECT p.url FROM collection_item_photos p JOIN collection_items ci ON ci.id = p.collection_item_id
       WHERE ci.user_id = ${userId}`);
    return rows.map((r) => r.url);
  }

  async function userIdByEmail(email: string): Promise<string | null> {
    const [u] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email.toLowerCase()));
    return u?.id ?? null;
  }

  return {
    uploadedFileUrls,
    publicOwner,
    userIdByEmail,
    isUsernameAvailable,
    suggestUsername,
    ensureProfile,
    getProfile,
    updateProfile,
  };
}

export type ProfileService = ReturnType<typeof profileService>;
