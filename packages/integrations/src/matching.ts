import { normalizeText } from '@kollektor/core';

/** "Money - 2011 Remastered Version" / "Money (Live)" → "money" for comparison. */
export function coreTitle(title: string): string {
  return normalizeText(
    title
      .replace(/\s[-–]\s.*(remaster|version|mix|edit|mono|stereo|live|demo|take).*$/i, '')
      .replace(/\s*[([].*?(remaster|version|mix|edit|mono|stereo|live|demo|take).*?[)\]]/gi, ''),
  );
}

export function isLiveOrAlt(title: string): boolean {
  return /\b(live|demo|karaoke|instrumental|cover|remix)\b/i.test(title);
}

/**
 * Heuristic 0..1 confidence that a candidate is the requested recording.
 * Title must match; artist and duration add confidence; live/alt versions are penalized
 * unless the requested title itself is one.
 */
export function scoreMatch(
  want: { title: string; artist: string; durationSeconds?: number | null },
  got: { title: string; artists: string[]; durationSeconds?: number | null },
): number {
  const wt = coreTitle(want.title);
  const gt = coreTitle(got.title);
  if (!wt || !gt) return 0;
  let score = 0;
  if (gt === wt) score += 0.55;
  else if (gt.includes(wt) || wt.includes(gt)) score += 0.35;
  else return 0;
  const wa = normalizeText(want.artist);
  const artistHit = got.artists.some((a) => {
    const n = normalizeText(a);
    return n === wa || n.includes(wa) || wa.includes(n);
  });
  if (artistHit) score += 0.35;
  if (want.durationSeconds && got.durationSeconds) {
    const diff = Math.abs(want.durationSeconds - got.durationSeconds);
    if (diff <= 5) score += 0.1;
    else if (diff > 30) score -= 0.2;
  }
  if (isLiveOrAlt(got.title) && !isLiveOrAlt(want.title)) score -= 0.25;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}
