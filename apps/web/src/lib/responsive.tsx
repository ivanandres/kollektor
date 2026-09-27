'use client';

import { useSyncExternalStore, type ReactNode } from 'react';

const QUERY = '(min-width: 960px)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** True at the web layout width (≥ 960px). Signed-in pages render client-side only. */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}

/** Renders only the layout for the current width (mobile 390 designs vs web 1280 designs). */
export function Responsive({ mobile, desktop }: { mobile: ReactNode; desktop: ReactNode }) {
  return <>{useIsDesktop() ? desktop : mobile}</>;
}
