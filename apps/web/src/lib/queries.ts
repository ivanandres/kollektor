'use client';

import type { CollectionQuery } from '@kollektor/schemas';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './api';

export type CollectionFilters = Partial<Omit<CollectionQuery, 'page'>>;

export const keys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  dashboard: ['dashboard'] as const,
  discover: ['discover'] as const,
  achievements: ['achievements'] as const,
  essentials: ['essentials'] as const,
  facets: ['facets'] as const,
  collection: (f: CollectionFilters) => ['collection', f] as const,
  item: (id: string) => ['item', id] as const,
  wishlist: ['wishlist'] as const,
  search: (q: string) => ['search', q] as const,
  trackLinks: (id: string) => ['trackLinks', id] as const,
};

export const useSession = () =>
  useQuery({ queryKey: keys.session, queryFn: () => api.auth.session(), staleTime: 5 * 60_000 });

export const useProfile = () =>
  useQuery({ queryKey: keys.profile, queryFn: () => api.me.profile(), staleTime: 5 * 60_000 });

export const useDashboard = () =>
  useQuery({ queryKey: keys.dashboard, queryFn: () => api.stats.dashboard() });

export const useDiscover = () =>
  useQuery({ queryKey: keys.discover, queryFn: () => api.discover() });

export const useAchievements = () =>
  useQuery({ queryKey: keys.achievements, queryFn: () => api.achievements.list() });

export const useEssentials = () =>
  useQuery({ queryKey: keys.essentials, queryFn: () => api.achievements.essentials() });

export const useStats = () => ({
  summary: useQuery({ queryKey: ['stats', 'summary'], queryFn: () => api.stats.summary() }),
  breakdowns: useQuery({
    queryKey: ['stats', 'breakdowns'],
    queryFn: () => api.stats.breakdowns(),
  }),
  value: useQuery({ queryKey: ['stats', 'value'], queryFn: () => api.stats.value() }),
  timeline: useQuery({ queryKey: ['stats', 'timeline'], queryFn: () => api.stats.timeline() }),
  duplicates: useQuery({
    queryKey: ['stats', 'duplicates'],
    queryFn: () => api.stats.duplicates(),
  }),
});

export const useFacets = () =>
  useQuery({ queryKey: keys.facets, queryFn: () => api.collection.facets() });

/** A single page (dashboards, previews). */
export const useCollectionPage = (f: CollectionFilters) =>
  useQuery({
    queryKey: keys.collection(f),
    queryFn: () => api.collection.list(f),
    placeholderData: keepPreviousData,
  });

/** Infinite list for the collection screens. */
export const useCollectionInfinite = (f: CollectionFilters) =>
  useInfiniteQuery({
    queryKey: [...keys.collection(f), 'infinite'],
    queryFn: ({ pageParam }) => api.collection.list({ ...f, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });

export const useItem = (id: string) =>
  useQuery({ queryKey: keys.item(id), queryFn: () => api.collection.get(id) });

export const useWishlist = () =>
  useQuery({
    queryKey: keys.wishlist,
    queryFn: () => api.wishlist.list({ includePurchased: true }),
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: keys.search(q),
    queryFn: () => api.search(q, 8),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });

export const useTrackLinks = (trackId: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.trackLinks(trackId),
    queryFn: () => api.catalog.trackLinks(trackId),
    enabled,
    staleTime: Infinity,
  });

/** After anything that changes the collection or wishlist, refresh every derived view. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        'dashboard',
        'discover',
        'achievements',
        'essentials',
        'facets',
        'collection',
        'wishlist',
        'search',
        'item',
        'stats',
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

export function useAddMissingToWishlist() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (albumId: string) => api.wishlist.add({ albumId, priority: 1 }),
    onSuccess: () => invalidate(),
  });
}
