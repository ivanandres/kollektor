import { eq } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { ProfileUpdateInput } from '@kollektor/schemas';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { conflict, notFound } from '../../lib/errors';
import { normalizeText } from '../../lib/normalize';

const { profiles, user } = schema;

export type Profile = typeof profiles.$inferSelect;

export function profileService(deps: CoreDeps, hooks: { onBaseCurrencyChanged?: (userId: string) => Promise<void> } = {}) {
  const { db } = deps;

  async function isUsernameAvailable(username: string, exceptUserId?: string): Promise<boolean> {
    const [row] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.username, username));
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
    const [u] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId));
    if (!u) throw notFound('Usuario');
    const username = await suggestUsername(u.name || u.email);
    const [created] = await db
      .insert(profiles)
      .values({ userId, username, displayName: u.name || null })
      .onConflictDoNothing()
      .returning();
    return created ?? (await db.select().from(profiles).where(eq(profiles.userId, userId)))[0]!;
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

  /**
   * What other users may see (V2). Private fields (storage location, purchase place) never
   * leave the owner; prices/values only if the owner opted in.
   */
  async function getPublicProfile(username: string) {
    const [p] = await db.select().from(profiles).where(eq(profiles.username, username));
    if (!p || p.profileVisibility !== 'public') throw notFound('Perfil');
    return {
      username: p.username,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      bio: p.bio,
      collectionVisible: p.collectionVisibility === 'public',
      wishlistVisible: p.wishlistVisibility === 'public',
    };
  }

  return { isUsernameAvailable, suggestUsername, ensureProfile, getProfile, updateProfile, getPublicProfile };
}

export type ProfileService = ReturnType<typeof profileService>;
