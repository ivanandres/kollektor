'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CondBadge, Cover } from '@/components/Cover';
import { SearchIcon } from '@/components/icons';
import {
  activeChips,
  activeCount,
  chipGroups,
  clearFilters,
  countryEs,
  isOn,
  SORT_LABEL,
  toggleValue,
  useUrlFilters,
  type Sort,
} from '@/lib/filters';
import { editionLine, formatShort, money, num, signed } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { useCollectionInfinite, useDashboard, useFacets, useProfile } from '@/lib/queries';
import { useDebounced } from '@/lib/search';
import { useSentinel } from './useSentinel';
import s from './collection.module.css';

const WEB_VIEWS = ['grid', 'tabla'] as const;
const GROUP_LIMIT = 6;

/** 1l — Colección web: filtros combinables + grid / tabla. */
export function CollectionWeb() {
  const router = useRouter();
  const [filters, setFilters] = useUrlFilters();
  const [view, setView] = usePref<(typeof WEB_VIEWS)[number]>('coleccionWeb', 'grid', WEB_VIEWS);
  const [text, setText] = useState(filters.q ?? '');
  const q = useDebounced(text, 300);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { data: facets } = useFacets();
  const { data: profile } = useProfile();
  const { data: dash } = useDashboard();
  const currency = profile?.baseCurrency ?? 'USD';

  useEffect(() => {
    if ((filters.q ?? '') !== q) setFilters({ ...filters, q: q || undefined });
    // only react to the debounced text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const list = useCollectionInfinite(filters);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total;
  const sentinel = useSentinel(
    () => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage(),
    !!list.hasNextPage,
  );
  const chips = activeChips(filters, facets, currency);
  const filtered = activeCount(filters) > 0 || !!filters.q;

  const range = (key: 'valueMin' | 'valueMax', ph: string) => (
    <input
      className="input"
      placeholder={ph}
      inputMode="decimal"
      aria-label={`Valor estimado ${ph}`}
      value={filters[key] ?? ''}
      onChange={(e) => {
        const v = e.target.value.replace(',', '.').replace(/[^\d.]/g, '');
        setFilters({ ...filters, [key]: v === '' ? undefined : Number(v) });
      }}
    />
  );

  return (
    <div className={s.web}>
      <aside className={s.side} aria-label="Filtros">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>Filtros</span>
          <button
            type="button"
            className="link"
            style={{ fontSize: 12 }}
            onClick={() => setFilters(clearFilters(filters))}
          >
            Limpiar todo
          </button>
        </div>
        {chipGroups(facets).map((g) =>
          g.options.length ? (
            <div key={g.key}>
              <div className="kicker" style={{ marginBottom: 8 }}>
                {g.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(expanded[g.key] ? g.options : g.options.slice(0, GROUP_LIMIT)).map((o) => {
                  const on = isOn(filters, g.key, o.value);
                  return (
                    <button
                      key={String(o.value)}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      className={s.check}
                      onClick={() => setFilters(toggleValue(filters, g.key, o.value))}
                    >
                      <span
                        className={s.box}
                        style={{ background: on ? 'var(--color-accent)' : 'transparent' }}
                      />
                      <span style={{ flex: 1 }}>{o.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--color-neutral-700)' }}>
                        {o.count}
                      </span>
                    </button>
                  );
                })}
                {g.options.length > GROUP_LIMIT ? (
                  <button
                    type="button"
                    className="link"
                    style={{ fontSize: 12, textAlign: 'left', padding: '5px 0' }}
                    onClick={() => setExpanded((x) => ({ ...x, [g.key]: !x[g.key] }))}
                  >
                    {expanded[g.key] ? 'Ver menos' : `Ver todos (${g.options.length})`}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null,
        )}
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            Valor estimado ({currency})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {range('valueMin', 'mín')}
            {range('valueMax', 'máx')}
          </div>
        </div>
        <div>
          <div className="kicker" style={{ marginBottom: 8 }}>
            Orden
          </div>
          <select
            className="input"
            value={filters.sort ?? 'added_desc'}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value as Sort })}
            aria-label="Orden"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k][0]!.toUpperCase() + SORT_LABEL[k].slice(1)}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <section style={{ minWidth: 0 }}>
        <div className={s.bar}>
          <div className={s.wTitle}>Colección</div>
          <span style={{ fontSize: 14, color: 'var(--color-neutral-700)', whiteSpace: 'nowrap' }}>
            {total != null ? num(total) : '…'}
            {filtered && dash ? ` de ${num(dash.summary.items)}` : ''}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip chip-accent"
                style={{ padding: '5px 10px' }}
                onClick={() => setFilters(c.remove(filters))}
              >
                {c.label} ×
              </button>
            ))}
          </div>
          <label className={`searchbox ${s.wText}`}>
            <SearchIcon size={15} />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Filtrar por texto…"
              aria-label="Filtrar por texto"
              type="search"
            />
          </label>
          <div className={`toggle ${s.wToggle}`} role="group" aria-label="Vista">
            <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              Grid
            </button>
            <button type="button" aria-pressed={view === 'tabla'} onClick={() => setView('tabla')}>
              Tabla
            </button>
          </div>
        </div>

        {list.isPending ? (
          <div className={s.wGrid}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="skeleton" style={{ aspectRatio: '1' }} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 28, fontSize: 15 }}>
            {filtered ? (
              <>
                Ningún vinilo cumple todos los filtros.{' '}
                <button
                  type="button"
                  className="link"
                  style={{ fontSize: 15 }}
                  onClick={() => (setText(''), setFilters({}))}
                >
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
          <div className={s.wGrid}>
            {items.map((a) => (
              <Link key={a.id} href={`/coleccion/${a.id}`} className="plain">
                <Cover url={a.coverImageUrl} label="portada">
                  {a.conditionMedia ? <CondBadge>{a.conditionMedia}</CondBadge> : null}
                </Cover>
                <div className={s.wCardTitle}>{a.title}</div>
                <div className={s.small}>
                  {a.artist}
                  {a.originalReleaseYear ? ` · ${a.originalReleaseYear}` : ''}
                </div>
                <div className={s.wCardMeta}>
                  <span className="ellipsis" style={{ color: 'var(--color-neutral-700)' }}>
                    {[countryEs(a.country), a.label].filter(Boolean).join(' · ')}
                  </span>
                  <b style={{ whiteSpace: 'nowrap' }}>
                    {money(a.estimatedValueBase, a.baseCurrency ?? currency)}
                  </b>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 52 }} />
                  <th>Artista</th>
                  <th>Álbum</th>
                  <th>Año</th>
                  <th>Edición</th>
                  <th>Formato</th>
                  <th>Cond.</th>
                  <th className={s.num}>Pagado</th>
                  <th className={s.num}>Estimado</th>
                  <th className={s.num}>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const diff =
                    a.estimatedValueBase != null && a.purchasePriceBase != null
                      ? a.estimatedValueBase - a.purchasePriceBase
                      : null;
                  return (
                    <tr key={a.id} onClick={() => router.push(`/coleccion/${a.id}`)}>
                      <td>
                        <Cover url={a.coverImageUrl} size={40} />
                      </td>
                      <td>{a.artist}</td>
                      <td style={{ fontWeight: 700 }}>
                        <Link href={`/coleccion/${a.id}`} className="plain">
                          {a.title}
                        </Link>
                      </td>
                      <td>{a.originalReleaseYear ?? '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {editionLine(a.country, a.releaseYear, a.editionType)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatShort(a.formatSummary)}</td>
                      <td>{a.conditionMedia ?? '—'}</td>
                      <td className={s.num}>{num(a.purchasePriceBase)}</td>
                      <td className={s.num} style={{ fontWeight: 700 }}>
                        {num(a.estimatedValueBase)}
                      </td>
                      <td
                        className={`${s.num} ${diff != null && diff < 0 ? 'neg' : 'pos'}`}
                        style={{ fontWeight: 600 }}
                      >
                        {signed(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div ref={sentinel} className={s.sentinel} />
        {list.isFetchingNextPage ? <div className="state">Cargando más…</div> : null}
      </section>
    </div>
  );
}
