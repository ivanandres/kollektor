'use client';

import { createQueries } from '@kollektor/app-logic/queries';
import * as ReactQuery from '@tanstack/react-query';
import { api } from './api';

export type { CollectionFilters } from '@kollektor/app-logic';
export { keys } from '@kollektor/app-logic/queries';

export const {
  useSession,
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
} = createQueries(api, ReactQuery);
