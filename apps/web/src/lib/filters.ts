'use client';

import type { CollectionFacets } from '@kollektor/api-client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { CollectionFilters } from './queries';

export type Sort = NonNullable<CollectionFilters['sort']>;

export const SORT_LABEL: Record<Sort, string> = {
  added_desc: 'reciente',
  added_asc: 'antiguo',
  artist_asc: 'artista',
  title_asc: 'título',
  year_asc: 'año ↑',
  year_desc: 'año ↓',
  paid_desc: 'más caro',
  value_desc: 'más valioso',
};

const LIST_KEYS = [
  'artistId',
  'albumId',
  'genre',
  'decade',
  'country',
  'condition',
  'format',
  'label',
  'editionType',
] as const;
type ListKey = (typeof LIST_KEYS)[number];
const NUM_KEYS = ['paidMin', 'paidMax', 'valueMin', 'valueMax'] as const;
type NumKey = (typeof NUM_KEYS)[number];

/** Filters the user can toggle as chips/checkboxes. */
export type ChipGroup = 'genre' | 'decade' | 'country' | 'condition';

export function parseFilters(p: URLSearchParams): CollectionFilters {
  const f: Record<string, unknown> = {};
  const q = p.get('q');
  if (q) f.q = q;
  for (const k of LIST_KEYS) {
    const v = p
      .getAll(k)
      .flatMap((x) => x.split(','))
      .filter(Boolean);
    if (v.length) f[k] = k === 'decade' ? v.map(Number) : v;
  }
  for (const k of NUM_KEYS) {
    const v = p.get(k);
    if (v != null && v !== '' && !Number.isNaN(Number(v))) f[k] = Number(v);
  }
  const sort = p.get('sort');
  if (sort && sort in SORT_LABEL) f.sort = sort;
  return f as CollectionFilters;
}

export function filtersToParams(f: CollectionFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  for (const k of LIST_KEYS)
    (f[k] as (string | number)[] | undefined)?.forEach((v) => p.append(k, String(v)));
  for (const k of NUM_KEYS) if (f[k] != null) p.set(k, String(f[k]));
  if (f.sort && f.sort !== 'added_desc') p.set('sort', f.sort);
  return p;
}

/** Number of active filters (text search and sort don't count). */
export function activeCount(f: CollectionFilters): number {
  let n = 0;
  for (const k of LIST_KEYS) n += (f[k] as unknown[] | undefined)?.length ?? 0;
  if (f.paidMin != null || f.paidMax != null) n++;
  if (f.valueMin != null || f.valueMax != null) n++;
  return n;
}

export function toggleValue(
  f: CollectionFilters,
  group: ChipGroup,
  value: string | number,
): CollectionFilters {
  const cur = ((f[group] as (string | number)[] | undefined) ?? []).map(String);
  const v = String(value);
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  const typed = group === 'decade' ? next.map(Number) : next;
  return { ...f, [group]: typed.length ? typed : undefined } as CollectionFilters;
}

export const isOn = (f: CollectionFilters, group: ChipGroup, value: string | number) =>
  ((f[group] as (string | number)[] | undefined) ?? []).map(String).includes(String(value));

export const clearFilters = (f: CollectionFilters): CollectionFilters => ({
  ...(f.q ? { q: f.q } : {}),
  ...(f.sort ? { sort: f.sort } : {}),
});

const COUNTRY_ES: Record<string, string> = {
  Japan: 'Japón',
  Germany: 'Alemania',
  Netherlands: 'Países Bajos',
  Europe: 'Europa',
  France: 'Francia',
  Italy: 'Italia',
  Spain: 'España',
  Brazil: 'Brasil',
  Mexico: 'México',
  Canada: 'Canadá',
  Sweden: 'Suecia',
  Belgium: 'Bélgica',
};
export const countryEs = (c: string | null | undefined) => (c ? (COUNTRY_ES[c] ?? c) : '—');

const GRADE_ORDER = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'];

/** Chip/checkbox groups built from the facets, in the mockups' order. */
export function chipGroups(facets: CollectionFacets | undefined) {
  if (!facets) return [];
  return [
    {
      key: 'genre' as const,
      name: 'Género',
      options: facets.genres.map((g) => ({ value: g.value, label: g.value, count: g.count })),
    },
    {
      key: 'decade' as const,
      name: 'Década',
      options: facets.decades.map((d) => ({
        value: Number(d.value),
        label: `${d.value}s`,
        count: d.count,
      })),
    },
    {
      key: 'country' as const,
      name: 'País',
      options: facets.countries.map((c) => ({
        value: c.value,
        label: countryEs(c.value),
        count: c.count,
      })),
    },
    {
      key: 'condition' as const,
      name: 'Condición',
      options: [...facets.conditions]
        .sort((a, b) => GRADE_ORDER.indexOf(a.value) - GRADE_ORDER.indexOf(b.value))
        .map((c) => ({ value: c.value, label: c.value, count: c.count })),
    },
  ];
}

/** Active filters as removable chips ("Rock ×", "1970s ×"). */
export function activeChips(
  f: CollectionFilters,
  facets: CollectionFacets | undefined,
  currency: string,
) {
  const chips: {
    key: string;
    label: string;
    remove: (f: CollectionFilters) => CollectionFilters;
  }[] = [];
  const without = (k: keyof CollectionFilters, v?: string | number) => (x: CollectionFilters) => {
    if (v === undefined) return { ...x, [k]: undefined };
    const next = ((x[k] as (string | number)[] | undefined) ?? []).filter(
      (y) => String(y) !== String(v),
    );
    return { ...x, [k]: next.length ? next : undefined };
  };
  f.artistId?.forEach((id) =>
    chips.push({
      key: `a${id}`,
      label: facets?.artists.find((a) => a.id === id)?.value ?? 'Artista',
      remove: without('artistId', id),
    }),
  );
  f.albumId?.forEach((id) =>
    chips.push({ key: `al${id}`, label: 'Este álbum', remove: without('albumId', id) }),
  );
  f.genre?.forEach((g) => chips.push({ key: `g${g}`, label: g, remove: without('genre', g) }));
  f.decade?.forEach((d) =>
    chips.push({ key: `d${d}`, label: `${d}s`, remove: without('decade', d) }),
  );
  f.country?.forEach((c) =>
    chips.push({ key: `c${c}`, label: countryEs(c), remove: without('country', c) }),
  );
  f.condition?.forEach((c) =>
    chips.push({ key: `k${c}`, label: c, remove: without('condition', c) }),
  );
  f.format?.forEach((c) => chips.push({ key: `f${c}`, label: c, remove: without('format', c) }));
  f.label?.forEach((c) => chips.push({ key: `l${c}`, label: c, remove: without('label', c) }));
  f.editionType?.forEach((c) =>
    chips.push({ key: `e${c}`, label: c, remove: without('editionType', c) }),
  );
  const range = (min?: number, max?: number) =>
    `${min != null ? `${currency} ${min}` : ''}–${max != null ? `${currency} ${max}` : ''}`;
  if (f.paidMin != null || f.paidMax != null)
    chips.push({
      key: 'paid',
      label: `Pagado ${range(f.paidMin, f.paidMax)}`,
      remove: (x) => ({ ...x, paidMin: undefined, paidMax: undefined }),
    });
  if (f.valueMin != null || f.valueMax != null)
    chips.push({
      key: 'value',
      label: `Valor ${range(f.valueMin, f.valueMax)}`,
      remove: (x) => ({ ...x, valueMin: undefined, valueMax: undefined }),
    });
  return chips;
}

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

export type { ListKey, NumKey };
