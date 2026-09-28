'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Cover, CondBadge } from '@/components/Cover';
import { SearchIcon } from '@/components/icons';
import { useSentinel } from '@/features/collection/useSentinel';
import p from '@/features/pages/pages.module.css';
import { api, ApiError } from '@/lib/api';
import { countryEs } from '@/lib/filters';
import { editionLine, money, num, PRIORITY_LABEL } from '@kollektor/app-logic';
import { useDebounced } from '@/lib/search';
import s from './public.module.css';

/** Perfil público (sin sesión): colección y wishlist según lo que el dueño hizo público. */
export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [tab, setTab] = useState<'coleccion' | 'wishlist'>('coleccion');
  const profile = useQuery({
    queryKey: ['public', username],
    queryFn: () => api.public.profile(username),
    retry: false,
  });
  const pr = profile.data;

  return (
    <div className={s.page}>
      <header className={s.bar}>
        <Link href="/" className={s.brand}>
          Kolektorz
        </Link>
        <Link href="/login?modo=registro" className={s.join}>
          Armá tu colección →
        </Link>
      </header>

      {profile.isPending ? (
        <div className="state">Cargando…</div>
      ) : !pr ? (
        <div style={{ padding: '32px 20px' }}>
          <div className={p.title}>
            {profile.error instanceof ApiError && profile.error.status === 404
              ? 'Este perfil es privado o no existe.'
              : 'No pudimos cargar el perfil.'}
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
            En Kolektorz las colecciones son privadas salvo que su dueño las haga públicas.
          </p>
        </div>
      ) : (
        <>
          <div className={s.head}>
            <div className={s.avatar}>
              {pr.avatarUrl ? <img src={pr.avatarUrl} alt="" /> : null}
            </div>
            <div style={{ minWidth: 0 }}>
              <h1 className={p.title}>{pr.displayName || pr.username}</h1>
              <div className={p.sub}>@{pr.username}</div>
              {pr.bio ? <p style={{ margin: '8px 0 0', fontSize: 14 }}>{pr.bio}</p> : null}
            </div>
          </div>
          {pr.stats ? (
            <div className={s.stats}>
              <div>
                <div className={s.num}>{num(pr.stats.items)}</div>
                <div className={p.small}>vinilos</div>
              </div>
              <div>
                <div className={s.num}>{num(pr.stats.artists)}</div>
                <div className={p.small}>artistas</div>
              </div>
              <div>
                <div className={s.num}>
                  {'estimated' in pr.stats && pr.stats.estimated != null
                    ? num(pr.stats.estimated)
                    : num(pr.stats.albums)}
                </div>
                <div className={p.small}>
                  {'estimated' in pr.stats && pr.stats.estimated != null
                    ? `${pr.stats.currency} estimado*`
                    : 'álbumes'}
                </div>
              </div>
            </div>
          ) : null}
          {pr.collectionVisible && pr.wishlistVisible ? (
            <div className={s.tabs} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'coleccion'}
                onClick={() => setTab('coleccion')}
              >
                Colección
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'wishlist'}
                onClick={() => setTab('wishlist')}
              >
                Wishlist
              </button>
            </div>
          ) : null}
          {pr.collectionVisible && (tab === 'coleccion' || !pr.wishlistVisible) ? (
            <PublicCollection username={username} />
          ) : pr.wishlistVisible ? (
            <PublicWishlist username={username} />
          ) : (
            <div className="state">Su colección no es pública.</div>
          )}
        </>
      )}
    </div>
  );
}

function PublicCollection({ username }: { username: string }) {
  const [text, setText] = useState('');
  const q = useDebounced(text, 300);
  const list = useInfiniteQuery({
    queryKey: ['public', username, 'collection', q],
    queryFn: ({ pageParam }) =>
      api.public.collection(username, { q: q || undefined, page: pageParam, pageSize: 48 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((x) => x.items) ?? [];
  const sentinel = useSentinel(
    () => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage(),
    !!list.hasNextPage,
    list.data?.pages.length ?? 0,
  );
  return (
    <section>
      <div className={s.search}>
        <label className="searchbox" style={{ height: 44 }}>
          <SearchIcon />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Artista, álbum, tema, sello…"
            type="search"
            aria-label="Buscar en esta colección"
          />
        </label>
      </div>
      {list.isPending ? (
        <div className="state">Cargando…</div>
      ) : items.length === 0 ? (
        <div className="state">
          {q ? 'Nada coincide con la búsqueda.' : 'Todavía no hay discos.'}
        </div>
      ) : (
        <div className={s.grid}>
          {items.map((a) => (
            <div key={a.id}>
              <Cover url={a.coverImageUrl} label="portada">
                {a.conditionMedia ? <CondBadge>{a.conditionMedia}</CondBadge> : null}
              </Cover>
              <div className={s.title}>{a.title}</div>
              <div className={p.small}>
                {a.artist}
                {a.originalReleaseYear ? ` · ${a.originalReleaseYear}` : ''}
              </div>
              <div
                className={p.small}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}
              >
                <span className="ellipsis">
                  {[countryEs(a.country), a.label].filter(Boolean).join(' · ')}
                </span>
                {'estimatedValueBase' in a && a.estimatedValueBase != null ? (
                  <b style={{ color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                    {money(a.estimatedValueBase, a.currency)}
                  </b>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={sentinel} style={{ height: 1 }} />
      <div className={p.small} style={{ padding: '8px 20px 24px', fontSize: 11 }}>
        * Valores estimados con datos de mercado. No es una tasación.
      </div>
    </section>
  );
}

function PublicWishlist({ username }: { username: string }) {
  const { data, isPending } = useQuery({
    queryKey: ['public', username, 'wishlist'],
    queryFn: () => api.public.wishlist(username),
  });
  const open = (data ?? []).filter((w) => w.status !== 'purchased');
  if (isPending) return <div className="state">Cargando…</div>;
  if (!open.length) return <div className="state">No está buscando nada por ahora.</div>;
  return (
    <section>
      {open.map((w) => (
        <div key={w.id} className={s.wish}>
          <Cover url={w.album.coverImageUrl} size={72} />
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{w.album.title}</div>
              <span
                style={{
                  font: '600 11px var(--mono)',
                  color: w.priority === 1 ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
                }}
              >
                {PRIORITY_LABEL[w.priority] ?? ''}
              </span>
            </div>
            <div className={p.small}>
              {w.album.artist} ·{' '}
              {w.release
                ? editionLine(w.release.country, w.release.releaseYear, w.release.editionType)
                : 'Cualquier edición'}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
