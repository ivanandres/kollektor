'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@/lib/queries';
import {
  rememberSearch,
  resultCountText,
  resultTotal,
  useDebounced,
  useOpenResult,
  useSearchSuggestions,
} from '@/lib/search';
import { Cover } from './Cover';
import { SearchIcon } from './icons';
import s from './CommandK.module.css';

/** Web global search (1m): ⌘K modal with results grouped in two columns. */
export function CommandK({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const { data } = useSearch(debounced);
  const suggestions = useSearchSuggestions();
  const open = useOpenResult();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (fn: () => unknown) => () => {
    rememberSearch(q);
    onClose();
    void fn();
  };
  const has = debounced.trim().length > 0 && data;
  const r = has ? data : undefined;

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        className={s.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en tu colección"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.inputRow}>
          <SearchIcon size={20} />
          <input
            ref={input}
            className={s.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && r) {
                const first =
                  (r.albums[0] && (() => open.album(r.albums[0]!))) ||
                  (r.artists[0] && (() => open.artist(r.artists[0]!.id))) ||
                  (r.tracks[0] && (() => open.track(r.tracks[0]!))) ||
                  (r.releases[0] && (() => open.release(r.releases[0]!)));
                if (first) go(first)();
              }
            }}
            placeholder="Artista, álbum, tema, sello…"
            aria-label="Buscar"
          />
          <button type="button" className={s.esc} onClick={onClose}>
            esc
          </button>
        </div>
        <div className={s.chipsRow}>
          <span className="muted" style={{ fontSize: 12, marginRight: 6 }}>
            Probá:
          </span>
          {suggestions.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              data-on={q.trim().toLowerCase() === c.toLowerCase()}
              onClick={() => setQ(c)}
            >
              {c}
            </button>
          ))}
          {r ? <span className={s.count}>{resultCountText(r, debounced)}</span> : null}
        </div>
        <div className={s.cols}>
          <div className={s.left}>
            {r?.artists.length ? (
              <>
                <div className={`kicker ${s.head}`}>Artistas</div>
                {r.artists.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`row-btn ${s.hit} ${s.hitRow}`}
                    onClick={go(() => open.artist(a.id))}
                  >
                    <b>{a.name}</b>
                    <span className={s.sub}>
                      {a.itemCount} {a.itemCount === 1 ? 'disco' : 'discos'}
                    </span>
                  </button>
                ))}
              </>
            ) : null}
            {r?.albums.length ? (
              <>
                <div className={`kicker ${s.head}`}>Álbumes</div>
                {r.albums.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`row-btn ${s.hit} ${s.album}`}
                    onClick={go(() => open.album(a))}
                  >
                    <Cover url={a.coverImageUrl} size={36} stripe={4} />
                    <div>
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
          </div>
          <div>
            {r?.tracks.length ? (
              <>
                <div className={`kicker ${s.head}`}>Temas</div>
                {r.tracks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`row-btn ${s.hit}`}
                    onClick={go(() => open.track(t))}
                  >
                    <div className={s.title}>{t.title}</div>
                    <div className={s.sub}>
                      {t.position ? `${t.position} · ` : ''}
                      {t.albumTitle} — {t.artist}
                    </div>
                  </button>
                ))}
              </>
            ) : null}
            {r?.releases.length ? (
              <>
                <div className={`kicker ${s.head}`}>Ediciones</div>
                {r.releases.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className={`row-btn ${s.hit}`}
                    onClick={go(() => open.release(e))}
                  >
                    <div className={s.title}>{e.albumTitle}</div>
                    <div className={s.sub}>
                      {[e.labels, e.catalogNumbers, e.country].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                ))}
              </>
            ) : null}
            {r && resultTotal(r) === 0 ? (
              <div className={s.empty}>Sin resultados en tu colección.</div>
            ) : null}
          </div>
        </div>
        <div className={s.foot}>
          <span className="muted">
            Busca en artistas, álbumes, temas, sellos, catálogo y año · tolera errores de tipeo
          </span>
          <button
            type="button"
            className="link"
            style={{ fontSize: 12 }}
            onClick={go(() => open.discogs(q))}
          >
            Buscar en Discogs →
          </button>
        </div>
      </div>
    </div>
  );
}
