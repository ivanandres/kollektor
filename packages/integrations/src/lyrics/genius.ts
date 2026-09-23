import type { LyricsProvider, TrackQuery } from '@kollektor/core';
import { fetchJson, type FetchLike } from '../http/fetch-json';
import { scoreMatch } from '../matching';

interface GeniusHit {
  type: string;
  result: { title: string; url: string; primary_artist: { name: string } };
}

/**
 * Lyrics via Genius: the API only returns the song page URL, so we link out ("Ver letra")
 * and never store lyrics. Swap for a licensed provider (e.g. Musixmatch) behind the same port.
 */
export class GeniusLyricsService implements LyricsProvider {
  readonly provider = 'genius';
  private readonly fetchImpl: FetchLike;

  constructor(private readonly cfg: { accessToken: string; fetch?: FetchLike }) {
    this.fetchImpl = cfg.fetch ?? fetch;
  }

  async findLyricsPage(q: TrackQuery) {
    const url = new URL('https://api.genius.com/search');
    url.searchParams.set('q', `${q.title} ${q.artist}`);
    const res = await fetchJson<{ response: { hits: GeniusHit[] } }>(
      this.fetchImpl,
      url.toString(),
      {
        headers: { Authorization: `Bearer ${this.cfg.accessToken}` },
      },
    );
    let best: { url: string; confidence: number } | null = null;
    for (const hit of res.response.hits) {
      if (hit.type !== 'song') continue;
      const confidence = scoreMatch(
        { title: q.title, artist: q.artist },
        { title: hit.result.title, artists: [hit.result.primary_artist.name] },
      );
      if (!best || confidence > best.confidence) best = { url: hit.result.url, confidence };
    }
    return best;
  }
}
