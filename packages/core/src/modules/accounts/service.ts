import { and, eq, lt } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { createCipher } from '../../lib/crypto';
import { DomainError, notFound } from '../../lib/errors';
import type { CatalogProvider, MarketValueProvider } from '../../ports';

const { externalAccounts, oauthRequests } = schema;
const PROVIDER = 'discogs';
const HANDSHAKE_TTL_MS = 15 * 60_000;

/** Linking the user's own Discogs account (OAuth 1.0a). Tokens are stored encrypted. */
export function accountService(deps: CoreDeps) {
  const { db } = deps;

  function setup() {
    const oauth = deps.discogsOAuth;
    const key = deps.config?.tokenEncryptionKey;
    if (!oauth || !key)
      throw new DomainError('NOT_CONFIGURED', 'La conexión con Discogs no está configurada');
    return { oauth, cipher: createCipher(key) };
  }

  /** Step 1: returns the Discogs page where the user authorizes Kollektor. */
  async function startDiscogsConnect(
    userId: string,
    callbackUrl: string,
    returnTo?: string | null,
  ) {
    const { oauth, cipher } = setup();
    await db.delete(oauthRequests).where(lt(oauthRequests.expiresAt, nowOf(deps)));
    const req = await oauth.requestToken(callbackUrl);
    await db.insert(oauthRequests).values({
      requestToken: req.token,
      userId,
      provider: PROVIDER,
      secretEnc: cipher.encrypt(req.secret),
      returnTo: returnTo ?? null,
      expiresAt: new Date(nowOf(deps).getTime() + HANDSHAKE_TTL_MS),
    });
    return { authorizeUrl: req.authorizeUrl };
  }

  /** Step 2 (callback): exchanges the verifier for the user's tokens. */
  async function completeDiscogsConnect(requestToken: string, verifier: string) {
    const { oauth, cipher } = setup();
    const [req] = await db
      .delete(oauthRequests)
      .where(
        and(eq(oauthRequests.requestToken, requestToken), eq(oauthRequests.provider, PROVIDER)),
      )
      .returning();
    if (!req || req.expiresAt < nowOf(deps))
      throw new DomainError('VALIDATION', 'La conexión con Discogs expiró. Probá de nuevo.');
    const access = await oauth.accessToken(requestToken, cipher.decrypt(req.secretEnc), verifier);
    const me = await oauth.identity(access.token, access.secret);
    const values = {
      userId: req.userId,
      provider: PROVIDER,
      externalUserId: me.id,
      externalUsername: me.username,
      tokenEnc: cipher.encrypt(access.token),
      secretEnc: cipher.encrypt(access.secret),
      updatedAt: nowOf(deps),
    };
    await db
      .insert(externalAccounts)
      .values(values)
      .onConflictDoUpdate({
        target: [externalAccounts.userId, externalAccounts.provider],
        set: values,
      });
    return { userId: req.userId, username: me.username, returnTo: req.returnTo };
  }

  async function discogsStatus(userId: string) {
    const [a] = await db
      .select({ username: externalAccounts.externalUsername, since: externalAccounts.createdAt })
      .from(externalAccounts)
      .where(and(eq(externalAccounts.userId, userId), eq(externalAccounts.provider, PROVIDER)));
    return a
      ? { connected: true, username: a.username, connectedAt: a.since.toISOString() }
      : { connected: false, username: null, connectedAt: null };
  }

  async function disconnectDiscogs(userId: string) {
    const deleted = await db
      .delete(externalAccounts)
      .where(and(eq(externalAccounts.userId, userId), eq(externalAccounts.provider, PROVIDER)))
      .returning({ userId: externalAccounts.userId });
    if (!deleted.length) throw notFound('Cuenta de Discogs vinculada');
  }

  /** API client acting as the user, or null if they haven't linked Discogs. */
  async function discogsFor(
    userId: string,
  ): Promise<{ username: string | null; client: CatalogProvider & MarketValueProvider } | null> {
    if (!deps.discogsOAuth || !deps.config?.tokenEncryptionKey) return null;
    const [a] = await db
      .select()
      .from(externalAccounts)
      .where(and(eq(externalAccounts.userId, userId), eq(externalAccounts.provider, PROVIDER)));
    if (!a) return null;
    const cipher = createCipher(deps.config.tokenEncryptionKey);
    return {
      username: a.externalUsername,
      client: deps.discogsOAuth.catalogFor(cipher.decrypt(a.tokenEnc), cipher.decrypt(a.secretEnc)),
    };
  }

  return {
    startDiscogsConnect,
    completeDiscogsConnect,
    discogsStatus,
    disconnectDiscogs,
    discogsFor,
  };
}

export type AccountService = ReturnType<typeof accountService>;
