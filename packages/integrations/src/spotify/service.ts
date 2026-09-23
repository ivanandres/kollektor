import type { MusicLinkMatch, MusicLinkProvider, TrackQuery } from '@kollektor/core';
import { fetchJson, type FetchLike } from '../http/fetch-json';
import { scoreMatch } from '../matching';

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string };
  external_urls: { spotify: string };
}

/** Spotify Web API (client-credentials flow, server-side only). Returns a link, never audio. */
export class SpotifyService implements MusicLinkProvider {
  readonly provider = 'spotify';
  private token: { value: string; expiresAt: number } | null = null;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly cfg: { clientId: string; clientSecret: string; market?: string; fetch?: FetchLike; now?: () => number }) {
    this.fetchImpl = cfg.fetch ?? fetch;
  }

  private async accessToken(): Promise<string> {
    const now = (this.cfg.now ?? Date.now)();
    if (this.token && this.token.expiresAt > now + 30_000) return this.token.value;
    const res = await fetchJson<{ access_token: string; expires_in: number }>(this.fetchImpl, 'https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${this.cfg.clientId}:${this.cfg.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    this.token = { value: res.access_token, expiresAt: now + res.expires_in * 1000 };
    return res.access_token;
  }

  async findTrack(q: TrackQuery): Promise<MusicLinkMatch | null> {
    const token = await this.accessToken();
    const query = `track:${q.title} artist:${q.artist}`;
    const url = new URL('https://api.spotify.com/v1/search');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'track');
    url.searchParams.set('limit', '10');
    if (this.cfg.market) url.searchParams.set('market', this.cfg.market);
    const res = await fetchJson<{ tracks: { items: SpotifyTrack[] } }>(this.fetchImpl, url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    let best: MusicLinkMatch | null = null;
    for (const t of res.tracks.items) {
      let confidence = scoreMatch(
        { title: q.title, artist: q.artist, durationSeconds: q.durationSeconds },
        { title: t.name, artists: t.artists.map((a) => a.name), durationSeconds: Math.round(t.duration_ms / 1000) },
      );
      if (q.album && t.album.name.toLowerCase().includes(q.album.toLowerCase())) confidence = Math.min(1, confidence + 0.05);
      if (!best || confidence > best.confidence) best = { url: t.external_urls.spotify, externalId: t.id, confidence };
    }
    return best;
  }
}
