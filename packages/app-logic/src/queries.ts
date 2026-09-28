import type * as ReactQuery from '@tanstack/react-query';
import type { ApiClient } from '@kollektor/api-client';

import type { CollectionFilters } from './filters';

export const keys = {
  session: ['session'] as const,
  authOptions: ['authOptions'] as const,
  accounts: ['accounts'] as const,
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

/**
 * React Query hooks over the API client, shared by the web and the mobile app:
 *   export const { useSession, useItem, … } = createQueries(api, ReactQuery);
 */
export function createQueries(api: ApiClient, rq: typeof ReactQuery) {
  // Injected so each app uses its own copy of React Query (and of React) with pnpm.
  const { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } = rq;
  const useSession = () =>
    useQuery({ queryKey: keys.session, queryFn: () => api.auth.session(), staleTime: 5 * 60_000 });

  /** Sign-in methods the server offers; fails closed (no Google button) if unreachable. */
  const useAuthOptions = () =>
    useQuery({
      queryKey: keys.authOptions,
      queryFn: () => api.auth.options(),
      staleTime: Infinity,
      retry: false,
    });

  /** Whether the account has a password (Google-only accounts don't). */
  const useHasPassword = () =>
    useQuery({
      queryKey: keys.accounts,
      queryFn: () => api.auth.accounts(),
      select: (accounts) => accounts.some((a) => a.providerId === 'credential'),
    });

  const useProfile = () =>
    useQuery({ queryKey: keys.profile, queryFn: () => api.me.profile(), staleTime: 5 * 60_000 });

  const useDashboard = () =>
    useQuery({ queryKey: keys.dashboard, queryFn: () => api.stats.dashboard() });

  const useDiscover = () => useQuery({ queryKey: keys.discover, queryFn: () => api.discover() });

  const useAchievements = () =>
    useQuery({ queryKey: keys.achievements, queryFn: () => api.achievements.list() });

  const useEssentials = () =>
    useQuery({ queryKey: keys.essentials, queryFn: () => api.achievements.essentials() });

  const useStats = () => ({
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

  const useFacets = () =>
    useQuery({ queryKey: keys.facets, queryFn: () => api.collection.facets() });

  /** A single page (dashboards, previews). */
  const useCollectionPage = (f: CollectionFilters) =>
    useQuery({
      queryKey: keys.collection(f),
      queryFn: () => api.collection.list(f),
      placeholderData: keepPreviousData,
    });

  /** Infinite list for the collection screens. */
  const useCollectionInfinite = (f: CollectionFilters) =>
    useInfiniteQuery({
      queryKey: [...keys.collection(f), 'infinite'],
      queryFn: ({ pageParam }) => api.collection.list({ ...f, page: pageParam }),
      initialPageParam: 1,
      getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
      placeholderData: keepPreviousData,
    });

  const useItem = (id: string) =>
    useQuery({ queryKey: keys.item(id), queryFn: () => api.collection.get(id) });

  const useWishlist = () =>
    useQuery({
      queryKey: keys.wishlist,
      queryFn: () => api.wishlist.list({ includePurchased: true }),
    });

  const useSearch = (q: string) =>
    useQuery({
      queryKey: keys.search(q),
      queryFn: () => api.search(q, 8),
      enabled: q.trim().length > 0,
      placeholderData: keepPreviousData,
    });

  const useTrackLinks = (trackId: string, enabled: boolean) =>
    useQuery({
      queryKey: keys.trackLinks(trackId),
      queryFn: () => api.catalog.trackLinks(trackId),
      enabled,
      staleTime: Infinity,
    });

  /** After anything that changes the collection or wishlist, refresh every derived view. */
  function useInvalidateAll() {
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

  function useAddMissingToWishlist() {
    const invalidate = useInvalidateAll();
    return useMutation({
      mutationFn: (albumId: string) => api.wishlist.add({ albumId, priority: 1 }),
      onSuccess: () => invalidate(),
    });
  }

  return {
    useSession,
    useAuthOptions,
    useHasPassword,
    useProfile,
    useDashboard,
    useDiscover,
    useAchievements,
    useEssentials,
    useStats,
    useFacets,
    useCollectionPage,
    useCollectionInfinite,
    useItem,
    useWishlist,
    useSearch,
    useTrackLinks,
    useInvalidateAll,
    useAddMissingToWishlist,
  };
}
