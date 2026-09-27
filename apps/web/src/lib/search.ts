'use client';

import type { SearchResults } from '@kollektor/api-client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useFacets } from './queries';

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const RECENT_KEY = 'kz.recentSearches';

export function rememberSearch(q: string) {
  const t = q.trim();
  if (!t) return;
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable (private mode): suggestions fall back to the collection
  }
}

/** Quick chips: recent searches first, then the most frequent artists and labels. */
export function useSearchSuggestions(): string[] {
  const { data: facets } = useFacets();
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'));
    } catch {
      setRecent([]);
    }
  }, []);
  return useMemo(() => {
    const out: string[] = [];
    const push = (s: string | undefined) => {
      if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
    };
    recent.forEach(push);
    facets?.artists.slice(0, 3).forEach((a) => push(a.value));
    push(facets?.labels[0]?.value);
    facets?.genres.slice(0, 1).forEach((g) => push(g.value));
    return out.slice(0, 5);
  }, [facets, recent]);
}

export const resultTotal = (r: SearchResults | undefined) =>
  r ? r.artists.length + r.albums.length + r.releases.length + r.tracks.length : 0;

export const resultCountText = (r: SearchResults | undefined, q: string) =>
  `${resultTotal(r)} resultado${resultTotal(r) === 1 ? '' : 's'} para “${q.trim()}”`;

/** Where each kind of search hit leads. */
export function useOpenResult() {
  const router = useRouter();
  return {
    artist: (id: string) => router.push(`/coleccion?artistId=${id}`),
    album: async (a: SearchResults['albums'][number]) => {
      if (a.itemCount === 0) return router.push('/wishlist');
      const page = await api.collection.list({ albumId: [a.id], pageSize: 2 });
      if (page.total === 1 && page.items[0]) router.push(`/coleccion/${page.items[0].id}`);
      else router.push(`/coleccion?albumId=${a.id}`);
    },
    release: (r: SearchResults['releases'][number]) => {
      const id = r.collectionItemIds[0];
      if (id) router.push(`/coleccion/${id}`);
    },
    track: (t: SearchResults['tracks'][number]) => {
      if (t.collectionItemId) router.push(`/coleccion/${t.collectionItemId}?tema=${t.id}`);
      else router.push('/wishlist');
    },
    discogs: (q: string) => router.push(`/agregar?q=${encodeURIComponent(q.trim())}`),
  };
}
