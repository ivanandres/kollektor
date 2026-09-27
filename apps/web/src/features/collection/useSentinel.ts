'use client';

import { useEffect, useRef } from 'react';

/** Calls `onVisible` when the returned element scrolls into view (infinite lists). */
export function useSentinel(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && cb.current(), {
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
