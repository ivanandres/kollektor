import { and, eq } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { notFound } from '../../lib/errors';
import { formatArtistCredit, type CatalogService } from '../catalog/service';
import type { TrackQuery } from '../../ports';

const { trackLinks, tracks, releases } = schema;

export const MIN_LINK_CONFIDENCE = 0.6;

export type LinkResult =
  | { status: 'found'; url: string; confidence: number }
  | { status: 'not_found'; message: string }
  | { status: 'unavailable'; message: string };

const NOT_FOUND_MSG = 'No encontramos este tema.';

/**
 * Lazy, cached lookup of external links for a track. Only verified matches (confidence ≥ 0.6)
 * are returned as links — we never invent a URL.
 */
export function musicLinkService(deps: CoreDeps, catalog: CatalogService) {
  const { db } = deps;
  const retryAfterMs = (deps.config?.musicLinkRetryAfterDays ?? 30) * 86_400_000;

  async function trackQuery(userId: string, trackId: string): Promise<TrackQuery> {
    const [t] = await db
      .select({
        title: tracks.title,
        duration: tracks.durationSeconds,
        artistCredit: tracks.artistCredit,
        releaseId: tracks.releaseId,
      })
      .from(tracks)
      .innerJoin(releases, eq(releases.id, tracks.releaseId))
      .where(eq(tracks.id, trackId));
    if (!t) throw notFound('Tema');
    const release = await catalog.getReleaseDetail(userId, t.releaseId);
    return {
      artist: t.artistCredit ?? formatArtistCredit(release.album.artists),
      title: t.title,
      album: release.album.title,
      durationSeconds: t.duration,
    };
  }

  async function resolve(
    trackId: string,
    provider: string,
    lookup: () => Promise<{ url: string; externalId?: string; confidence: number } | null>,
  ): Promise<LinkResult> {
    const [cached] = await db
      .select()
      .from(trackLinks)
      .where(and(eq(trackLinks.trackId, trackId), eq(trackLinks.provider, provider)));
    const now = nowOf(deps);
    if (cached?.status === 'found' && cached.url)
      return { status: 'found', url: cached.url, confidence: cached.confidence ?? 1 };
    if (cached?.status === 'not_found' && now.getTime() - cached.checkedAt.getTime() < retryAfterMs)
      return { status: 'not_found', message: NOT_FOUND_MSG };

    let match: Awaited<ReturnType<typeof lookup>>;
    try {
      match = await lookup();
    } catch {
      // Upstream error or quota exhausted: don't cache, try again later.
      return { status: 'unavailable', message: 'El servicio no está disponible en este momento.' };
    }
    const found = match != null && match.confidence >= MIN_LINK_CONFIDENCE;
    const values = {
      trackId,
      provider,
      status: found ? ('found' as const) : ('not_found' as const),
      url: found ? match!.url : null,
      externalId: found ? (match!.externalId ?? null) : null,
      confidence: match?.confidence ?? null,
      checkedAt: now,
    };
    await db
      .insert(trackLinks)
      .values(values)
      .onConflictDoUpdate({ target: [trackLinks.trackId, trackLinks.provider], set: values });
    return found
      ? { status: 'found', url: match!.url, confidence: match!.confidence }
      : { status: 'not_found', message: NOT_FOUND_MSG };
  }

  async function getLinks(userId: string, trackId: string) {
    const q = await trackQuery(userId, trackId);
    const entries = await Promise.all(
      (deps.musicLinks ?? []).map(
        async (p) =>
          [p.provider, await resolve(trackId, p.provider, () => p.findTrack(q))] as const,
      ),
    );
    const lyrics = deps.lyrics
      ? await resolve(trackId, 'lyrics', () => deps.lyrics!.findLyricsPage(q))
      : ({ status: 'unavailable', message: 'Letras no configuradas.' } as LinkResult);
    return { track: q, links: Object.fromEntries(entries) as Record<string, LinkResult>, lyrics };
  }

  return { getLinks };
}

export type MusicLinkService = ReturnType<typeof musicLinkService>;
