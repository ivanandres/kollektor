'use client';

import { useCallback, useEffect, useState } from 'react';

/** Per-device UI preferences (view modes), kept in localStorage. */
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`kz.${key}`) as T | null;
      if (v && allowed.includes(v)) setValue(v);
    } catch {
      // storage unavailable
    }
    // `allowed` is a constant tuple at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(`kz.${key}`, v);
      } catch {
        // storage unavailable
      }
    },
    [key],
  );
  return [value, set] as const;
}

export const DASHBOARD_VARIANTS = ['progreso', 'numeros'] as const;
export type DashboardVariant = (typeof DASHBOARD_VARIANTS)[number];
export const useDashboardVariant = () =>
  usePref<DashboardVariant>('inicio', 'progreso', DASHBOARD_VARIANTS);

export const COLLECTION_VIEWS = ['grid', 'lista', 'estante'] as const;
export type CollectionView = (typeof COLLECTION_VIEWS)[number];
