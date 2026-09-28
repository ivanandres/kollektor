'use client';

import { filtersToParams, parseFilters, type CollectionFilters } from '@kollektor/app-logic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export * from '@kollektor/app-logic/filters';

/** Filters live in the URL so a filtered view can be shared and survives reloads. */
export function useUrlFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const setFilters = useCallback(
    (f: CollectionFilters) => {
      const qs = filtersToParams(f).toString();
      router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    },
    [router, path],
  );
  return [filters, setFilters] as const;
}
