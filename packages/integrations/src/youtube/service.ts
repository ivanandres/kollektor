import type { MusicLinkMatch, MusicLinkProvider, TrackQuery } from '@kollektor/core';
import { normalizeText } from '@kollektor/core';
import { fetchJson, type FetchLike } from '../http/fetch-json';
import { coreTitle, isLiveOrAlt } from '../matching';

interface YtItem {
  id: { videoId?: string };
  snippet: { title: string; channelTitle: string };
}

/**
 * YouTube Data API v3 search. Each search costs ~100 quota units (10k/day by default),
 * which is why lookups are lazy and cached by the core.
 */
export class YouTubeService implements MusicLinkProvider {
  readonly provider = 'youtube';
  private readonly fetchImpl: FetchLike;

  constructor(private readonly cfg: { apiKey: string; fetch?: FetchLike }) {
    this.fetchImpl = cfg.fetch ?? fetch;
  }

  async findTrack(q: TrackQuery): Promise<MusicLinkMatch | null> {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10'); // Music
    url.searchParams.set('maxResults', '5');
    url.searchParams.set('q', `${q.artist} ${q.title}`);
    url.searchParams.set('key', this.cfg.apiKey);
    const res = await fetchJson<{ items: YtItem[] }>(this.fetchImpl, url.toString());
    const title = coreTitle(q.title);
    const artist = normalizeText(q.artist);
    let best: MusicLinkMatch | null = null;
    for (const item of res.items) {
      if (!item.id.videoId) continue;
      const videoTitle = normalizeText(item.snippet.title);
      const channel = normalizeText(item.snippet.channelTitle.replace(/\s*-\s*topic$/i, ''));
      if (!videoTitle.includes(title)) continue;
      let confidence = 0.4;
      if (channel === artist) confidence += 0.4; // official "Artist - Topic" / artist channel
      else if (videoTitle.includes(artist)) confidence += 0.25;
      if (isLiveOrAlt(item.snippet.title) && !isLiveOrAlt(q.title)) confidence -= 0.25;
      confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));
      if (!best || confidence > best.confidence)
        best = { url: `https://www.youtube.com/watch?v=${item.id.videoId}`, externalId: item.id.videoId, confidence };
    }
    return best;
  }
}
