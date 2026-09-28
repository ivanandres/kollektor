'use client';

import { useEffect } from 'react';

/** Registers the offline service worker in production builds. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}

/** Drops cached personal data (on sign-out / account deletion). */
export function clearOfflineData() {
  navigator.serviceWorker?.controller?.postMessage('kz:clear-data');
}
