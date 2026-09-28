'use client';

import type { CollectionListItem } from '@kollektor/api-client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CondBadge, Cover } from '@/components/Cover';
import { FilterSheet } from '@/components/FilterSheet';
import { GridIcon, ListIcon, SearchIcon, ShelfIcon } from '@/components/icons';
import { activeChips, activeCount, SORT_LABEL, useUrlFilters } from '@/lib/filters';
import { editionLine, formatShort, money, num, shelfName } from '@/lib/format';
import { usePref, COLLECTION_VIEWS, type CollectionView } from '@/lib/prefs';
import { useCollectionInfinite, useFacets, useProfile } from '@/lib/queries';
import { useDebounced } from '@/lib/search';
import { useSentinel } from './useSentinel';
import s from './collection.module.css';

/** 1d — Colección grid / lista, plus 1e — estante de lomos as a third view. */
export function CollectionMobile() {
  const [filters, setFilters] = useUrlFilters();
  const [view, setView] = usePref<CollectionView>('coleccion', 'grid', COLLECTION_VIEWS);
  const [sheet, setSheet] = useState(false);
  const [text, setText] = useState(filters.q ?? '');
  const q = useDebounced(text, 300);
  const { data: facets } = useFacets();
  const { data: profile } = useProfile();
  const currency = profile?.baseCurrency ?? 'USD';

  // Keep the text box in sync when the URL changes from outside (⌘K, back button).
  useEffect(() => {
    if ((filters.q ?? '') !== q) setText(filters.q ?? '');
    // only when the URL's q changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  useEffect(() => {
    if ((filters.q ?? '') !== q) setFilters({ ...filters, q: q || undefined });
    // only react to the debounced text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // The shelf is always alphabetical by artist.
  const query = useMemo(
    () => ({
      ...filters,
      ...(view === 'estante' ? { sort: 'artist_asc' as const, pageSize: 200 } : {}),
    }),
    [filters, view],
  );
  const list = useCollectionInfinite(query);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total;
  const sentinel = useSentinel(
    () => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage(),
    !!list.hasNextPage,
    list.data?.pages.length ?? 0,
  );
  const chips = activeChips(filters, facets, currency);
  const nActive = activeCount(filters);

  return (
    <div>
      <div className={`m-head ${s.head}`}>
        <div className={s.titleRow}>
          <div className={s.title}>{view === 'estante' ? 'Estante' : 'Colección'}</div>
          <div
            className={s.count}
            style={view === 'estante' ? { fontSize: 13, fontWeight: 400 } : undefined}
          >
            {view === 'estante' ? 'A–Z por artista' : total != null ? num(total) : ''}
          </div>
        </div>
        <div className={s.searchRow}>
          <label className="searchbox">
            <SearchIcon />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Artista, álbum, tema, sello…"
              aria-label="Buscar en tu colección"
              type="search"
            />
          </label>
          <div className={`toggle ${s.viewToggle}`} role="group" aria-label="Vista">
            <button
              type="button"
              aria-pressed={view === 'grid'}
              aria-label="Grid"
              onClick={() => setView('grid')}
            >
              <GridIcon />
            </button>
            <button
              type="button"
              aria-pressed={view === 'lista'}
              aria-label="Lista"
              onClick={() => setView('lista')}
            >
              <ListIcon />
            </button>
            <button
              type="button"
              aria-pressed={view === 'estante'}
              aria-label="Estante"
              onClick={() => setView('estante')}
            >
              <ShelfIcon />
            </button>
          </div>
        </div>
        <div className={s.chips}>
          <button type="button" className="chip chip-solid" onClick={() => setSheet(true)}>
            Filtros{nActive ? ` · ${nActive}` : ''}
          </button>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="chip chip-accent"
              onClick={() => setFilters(c.remove(filters))}
            >
              {c.label} ×
            </button>
          ))}
          {view !== 'estante' ? (
            <button type="button" className="chip" onClick={() => setSheet(true)}>
              Orden: {SORT_LABEL[filters.sort ?? 'added_desc']}
            </button>
          ) : null}
        </div>
      </div>

      {list.isPending ? (
        <div className={s.grid}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="state">
          {nActive || filters.q ? (
            <>
              Ningún vinilo cumple todos los filtros.{' '}
              <button type="button" className="link" onClick={() => (setText(''), setFilters({}))}>
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              Tu colección está vacía. <Link href="/agregar">Agregá tu primer vinilo →</Link>
            </>
          )}
        </div>
      ) : view === 'grid' ? (
        <div className={s.grid}>
          {items.map((a) => (
            <Link key={a.id} href={`/coleccion/${a.id}`} className="plain">
              <Cover url={a.coverImageUrl} label="portada">
                {a.conditionMedia ? <CondBadge>{a.conditionMedia}</CondBadge> : null}
              </Cover>
              <div className={s.gTitle}>{a.title}</div>
              <div className={s.small}>
                {a.artist}
                {a.originalReleaseYear ? ` · ${a.originalReleaseYear}` : ''}
              </div>
              <div className={s.gValue}>
                {money(a.estimatedValueBase, a.baseCurrency ?? currency)}
              </div>
            </Link>
          ))}
        </div>
      ) : view === 'lista' ? (
        <div>
          {items.map((a) => (
            <Link key={a.id} href={`/coleccion/${a.id}`} className={`plain ${s.listRow}`}>
              <Cover url={a.coverImageUrl} size={56} />
              <div style={{ minWidth: 0 }}>
                <div className={`ellipsis ${s.lTitle}`}>{a.title}</div>
                <div className={s.small}>
                  {a.artist}
                  {a.originalReleaseYear ? ` · ${a.originalReleaseYear}` : ''}
                </div>
                <div className={s.tiny}>
                  {editionLine(a.country, a.releaseYear, a.editionType)} ·{' '}
                  {formatShort(a.formatSummary)}
                  {a.conditionMedia ? ` · ${a.conditionMedia}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {money(a.estimatedValueBase, a.baseCurrency ?? currency)}
                </div>
                {a.purchasePriceBase != null ? (
                  <div className={s.tiny}>pagué {num(a.purchasePriceBase)}</div>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Shelf items={items} currency={currency} />
      )}
      <div ref={sentinel} className={s.sentinel} />
      {list.isFetchingNextPage ? <div className="state">Cargando más…</div> : null}

      {sheet ? (
        <FilterSheet
          value={filters}
          onChange={setFilters}
          count={total}
          currency={currency}
          onClose={() => setSheet(false)}
        />
      ) : null}
    </div>
  );
}

const SPINE_BG = [
  'var(--color-text)',
  'var(--color-surface)',
  'var(--color-neutral-300)',
  'var(--color-bg)',
  'var(--color-neutral-700)',
  'var(--color-surface)',
];
const DARK = new Set([0, 4]);

/** Stable pseudo-random spine height (44–61px) from the item id. */
function spineHeight(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 44 + (h % 18);
}

/** 1e — Estante de lomos: A–Z by artist ("The" ignored); tap a spine to preview, tap again to open. */
function Shelf({ items, currency }: { items: CollectionListItem[]; currency: string }) {
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          shelfName(a.artist).localeCompare(shelfName(b.artist), 'es') ||
          (a.originalReleaseYear ?? 0) - (b.originalReleaseYear ?? 0),
      ),
    [items],
  );
  const [selId, setSelId] = useState<string | null>(null);
  const sel = sorted.find((x) => x.id === selId) ?? sorted[0];
  return (
    <>
      <div>
        {sorted.map((a, i) => {
          const isSel = a.id === sel?.id;
          const dark = isSel || DARK.has(i % SPINE_BG.length);
          return (
            <button
              key={a.id}
              type="button"
              className={`row-btn ${s.spine}`}
              aria-pressed={isSel}
              onClick={() => setSelId(a.id)}
              style={{
                height: spineHeight(a.id),
                background: isSel ? 'var(--color-accent)' : SPINE_BG[i % SPINE_BG.length],
                color: dark ? 'var(--color-bg)' : 'var(--color-text)',
                display: 'grid',
              }}
            >
              <span className={s.spineLetter}>{shelfName(a.artist)[0]?.toUpperCase()}</span>
              <span className={`ellipsis ${s.spineName}`}>
                {a.artist} — {a.title}
              </span>
              <span className={s.spineYear}>{a.originalReleaseYear ?? ''}</span>
            </button>
          );
        })}
      </div>
      {sel ? (
        <Link href={`/coleccion/${sel.id}`} className={s.preview}>
          <Cover url={sel.coverImageUrl} size={72} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{sel.title}</div>
            <div className={s.small}>
              {sel.artist} · {editionLine(sel.country, sel.releaseYear, sel.editionType)}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              <b>{money(sel.estimatedValueBase, sel.baseCurrency ?? currency)}</b> est.
              {sel.purchasePriceBase != null
                ? ` · pagué ${money(sel.purchasePriceBase, sel.baseCurrency ?? currency)}`
                : ''}
            </div>
          </div>
        </Link>
      ) : null}
    </>
  );
}
