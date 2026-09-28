'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Cover } from '@/components/Cover';
import { FilterSheet } from '@/components/FilterSheet';
import { FilterIcon, SearchIcon } from '@/components/icons';
import { filtersToParams } from '@/lib/filters';
import { useCollectionPage, useProfile, useSearch, type CollectionFilters } from '@/lib/queries';
import {
  rememberSearch,
  resultCountText,
  resultTotal,
  useDebounced,
  useOpenResult,
  useSearchSuggestions,
} from '@/lib/search';
import s from './buscar.module.css';

/** 1f — Buscador global (mobile) + hoja de filtros. */
export default function SearchPage() {
  return (
    <Suspense>
      <Search />
    </Suspense>
  );
}

function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get('q') ?? '');
  const debounced = useDebounced(q);
  const { data } = useSearch(debounced);
  const suggestions = useSearchSuggestions();
  const open = useOpenResult();
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState(false);
  const [draft, setDraft] = useState<CollectionFilters>({});
  const { data: profile } = useProfile();
  const { data: preview } = useCollectionPage({ ...draft, pageSize: 1 });

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    router.replace(debounced ? `/buscar?q=${encodeURIComponent(debounced)}` : '/buscar', {
      scroll: false,
    });
  }, [debounced, router]);

  const r = debounced.trim() && data ? data : undefined;
  const go = (fn: () => unknown) => () => {
    rememberSearch(q);
    void fn();
  };

  return (
    <div className={s.page}>
      <div className={`m-head ${s.head}`}>
        <div style={{ display: 'flex', gap: 8 }}>
          <label className={`searchbox ${s.box}`}>
            <SearchIcon size={18} />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && rememberSearch(q)}
              placeholder="Artista, álbum, tema, sello…"
              aria-label="Buscar"
              type="search"
              enterKeyHint="search"
            />
          </label>
          <button
            type="button"
            className={s.filterBtn}
            aria-label="Filtros"
            onClick={() => setSheet(true)}
          >
            <FilterIcon />
          </button>
        </div>
        <div className={s.chips}>
          {suggestions.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              style={{ padding: '5px 10px' }}
              data-on={q.trim().toLowerCase() === c.toLowerCase()}
              onClick={() => setQ(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className={s.results}>
        {r ? <div className={s.count}>{resultCountText(r, debounced)}</div> : null}
        {r?.artists.length ? (
          <>
            <div className={`kicker ${s.group}`}>Artistas</div>
            {r.artists.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`row-btn ${s.row}`}
                onClick={go(() => open.artist(a.id))}
              >
                <div className={s.avatar} />
                <div style={{ flex: 1 }}>
                  <div className={s.title}>{a.name}</div>
                  <div className={s.sub}>{a.itemCount} en tu colección</div>
                </div>
              </button>
            ))}
          </>
        ) : null}
        {r?.albums.length ? (
          <>
            <div className={`kicker ${s.group}`}>Álbumes</div>
            {r.albums.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`row-btn ${s.row}`}
                onClick={go(() => open.album(a))}
              >
                <Cover url={a.coverImageUrl} size={40} stripe={4} />
                <div style={{ flex: 1 }}>
                  <div className={s.title}>{a.title}</div>
                  <div className={s.sub}>
                    {a.artist}
                    {a.year ? ` · ${a.year}` : ''}
                    {a.itemCount === 0 && a.inWishlist ? ' · en wishlist' : ''}
                  </div>
                </div>
              </button>
            ))}
          </>
        ) : null}
        {r?.tracks.length ? (
          <>
            <div className={`kicker ${s.group}`}>Temas</div>
            {r.tracks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`row-btn ${s.row} ${s.trackRow}`}
                onClick={go(() => open.track(t))}
              >
                <div className={s.pos}>{t.position}</div>
                <div>
                  <div className={s.title}>{t.title}</div>
                  <div className={s.sub}>
                    en {t.albumTitle} — {t.artist}
                  </div>
                </div>
              </button>
            ))}
          </>
        ) : null}
        {r?.releases.length ? (
          <>
            <div className={`kicker ${s.group}`}>Ediciones · sello · catálogo</div>
            {r.releases.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`row-btn ${s.row}`}
                onClick={go(() => open.release(e))}
                style={{ display: 'block' }}
              >
                <div className={s.title}>
                  {e.albumTitle}{' '}
                  <span style={{ fontWeight: 400, color: 'var(--color-neutral-700)' }}>
                    — {e.artist}
                  </span>
                </div>
                <div className={s.sub}>
                  {[e.labels, e.catalogNumbers, e.country, e.releaseYear]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </button>
            ))}
          </>
        ) : null}
        {r && resultTotal(r) === 0 ? (
          <div style={{ padding: '24px 20px', fontSize: 14 }}>
            Nada en tu colección.{' '}
            <button
              type="button"
              className="link"
              style={{
                color: 'var(--color-accent)',
                fontWeight: 400,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
              onClick={go(() => open.discogs(q))}
            >
              Buscar en Discogs →
            </button>
          </div>
        ) : null}
        {!r ? (
          <div className="state" style={{ fontSize: 13 }}>
            Busca en artistas, álbumes, temas, sellos, catálogo y año. Tolera errores de tipeo y
            combina palabras (“floyd money”, “emi 1973”).
          </div>
        ) : null}
      </div>
      {sheet ? (
        <FilterSheet
          value={draft}
          onChange={setDraft}
          count={preview?.total}
          currency={profile?.baseCurrency ?? 'USD'}
          onClose={() => setSheet(false)}
          onSubmit={() => {
            const qs = filtersToParams(draft).toString();
            router.push(qs ? `/coleccion?${qs}` : '/coleccion');
          }}
        />
      ) : null}
    </div>
  );
}
