import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

/** Small per-device preferences (view modes, drafts) in AsyncStorage. */
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    AsyncStorage.getItem(`kz.${key}`)
      .then((v) => {
        if (v && (allowed as readonly string[]).includes(v)) setValue(v as T);
      })
      .catch(() => {});
    // `allowed` is a constant tuple at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      AsyncStorage.setItem(`kz.${key}`, v).catch(() => {});
    },
    [key],
  );
  return [value, set] as const;
}

export const DASHBOARD_VARIANTS = ['progreso', 'numeros'] as const;
export const useDashboardVariant = () =>
  usePref<(typeof DASHBOARD_VARIANTS)[number]>('inicio', 'progreso', DASHBOARD_VARIANTS);
