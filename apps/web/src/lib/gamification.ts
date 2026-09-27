import type { Achievement, EssentialProgress, Insight } from '@kollektor/api-client';

/** The discography closest to completion that the user has started. */
export function pickEssential(list: EssentialProgress[] | undefined): EssentialProgress | null {
  const open = (list ?? []).filter((e) => !e.complete && e.owned > 0);
  open.sort(
    (a, b) => a.total - a.owned - (b.total - b.owned) || b.owned / b.total - a.owned / a.total,
  );
  return open[0] ?? null;
}

export function essentialHeadline(e: EssentialProgress): string {
  const missing = e.total - e.owned;
  return missing === 1
    ? `Te falta 1 disco para completar ${e.artistName}.`
    : `Te faltan ${missing} discos para completar ${e.artistName}.`;
}

export function essentialDetail(e: EssentialProgress): string {
  const first = e.missing[0];
  if (!first) return `${e.owned} de ${e.total}`;
  const more = e.missing.length - 1;
  return `${e.owned} de ${e.total} · falta ${first.title}${first.year ? ` (${first.year})` : ''}${
    more > 0 ? ` y ${more} más` : ''
  }`;
}

/** Nearest locked "N discos" milestone. */
export function nextCountAchievement(list: Achievement[] | undefined): Achievement | null {
  const locked = (list ?? []).filter((a) => a.category === 'coleccion' && !a.unlocked);
  locked.sort((a, b) => a.progress.target - b.progress.target);
  return locked[0] ?? null;
}

/** Dashboard badge row: recent unlocks first, then the closest locked ones. */
export function badgeRow(list: Achievement[] | undefined, n = 8): Achievement[] {
  const all = list ?? [];
  const got = all
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''));
  const locked = all
    .filter((a) => !a.unlocked)
    .sort(
      (a, b) =>
        b.progress.current / Math.max(1, b.progress.target) -
        a.progress.current / Math.max(1, a.progress.target),
    );
  const lockedShare = Math.max(2, n - got.length);
  return [
    ...got.slice(0, n - Math.min(lockedShare, locked.length)),
    ...locked.slice(0, lockedShare),
  ].slice(0, n);
}

/** Where an insight leads. */
export function insightHref(i: Insight): string {
  switch (i.type) {
    case 'wishlist_price_alert':
      return '/wishlist';
    case 'explore_artist':
      return `/agregar?q=${encodeURIComponent(i.artistName)}`;
    case 'decades':
      return '/estadisticas';
    default:
      return '/logros';
  }
}
