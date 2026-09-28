'use client';

import type { CollectionItem } from '@kollektor/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Cover } from '@/components/Cover';
import { money, signedMoney } from '@kollektor/app-logic';
import { useEssentials } from '@/lib/queries';
import { essentialFor, metaRows, tags, valueNote } from '@kollektor/app-logic';
import { MoreEditions } from './MoreEditions';
import { picturesOf } from './Photos';
import { TrackRowMobile } from './Tracks';
import s from './item.module.css';

/** 1i — Ficha del vinilo (mobile). */
export function ItemMobile({
  item,
  openTrack,
}: {
  item: CollectionItem;
  openTrack: string | null;
}) {
  const router = useRouter();
  const { data: essentials } = useEssentials();
  const [open, setOpen] = useState<string | null>(openTrack);
  const pics = picturesOf(item);
  const [pic, setPic] = useState(0);
  const cover = pics[pic]?.url ?? null;
  const v = item.value;
  const cur = v.baseCurrency;
  const ess = essentialFor(item, essentials);
  const privateBits = [
    item.storageLocation,
    item.purchasePlace ? `comprado en ${item.purchasePlace}` : null,
  ].filter(Boolean);

  return (
    <article>
      <Cover url={cover} stripe={9}>
        <div className={s.coverBar}>
          <div className={s.coverBtns}>
            <button
              type="button"
              onClick={() =>
                window.history.length > 1 ? router.back() : router.push('/coleccion')
              }
            >
              ← Colección
            </button>
            <Link href={`/coleccion/${item.id}/editar`}>Editar</Link>
          </div>
          {cover ? <span /> : <span className={s.coverCaption}>portada · 1:1</span>}
        </div>
      </Cover>

      {pics.length > 1 ? (
        <div className={s.photos} style={{ padding: '8px 20px 0' }}>
          {pics.map((p, i) => (
            <button
              key={p.url}
              type="button"
              className={s.thumb}
              style={{ width: 56 }}
              aria-pressed={i === pic}
              aria-label={p.label}
              onClick={() => setPic(i)}
            >
              <img src={p.url} alt="" />
            </button>
          ))}
        </div>
      ) : null}

      <div className={s.info}>
        <div className={s.artist}>{item.release.album.artistDisplay}</div>
        <h1 className={s.title}>{item.release.album.title}</h1>
        <div className={s.tags}>
          {tags(item).map((t) => (
            <span key={t.label} className={`tag tag-${t.kind}`}>
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className={s.values}>
        <div>
          <div className={s.label}>Pagaste</div>
          <div className={s.val}>{money(v.paid, cur)}</div>
        </div>
        <div>
          <div className={s.label}>Valor estimado</div>
          <div className={s.val}>{money(v.estimated, cur)}</div>
        </div>
        <div>
          <div className={s.label}>Diferencia</div>
          <div className={`${s.val} ${v.difference != null && v.difference < 0 ? 'neg' : 'pos'}`}>
            {signedMoney(v.difference, cur)}
          </div>
        </div>
        <div className={s.note}>{valueNote(item)}</div>
      </div>

      <div className={s.meta}>
        {metaRows(item).map((m) => (
          <div key={m.k}>
            <div className={s.label}>{m.k}</div>
            <div className={s.metaV}>
              {m.href ? (
                <a href={m.href} target="_blank" rel="noreferrer">
                  {m.v}
                </a>
              ) : (
                m.v
              )}
            </div>
          </div>
        ))}
      </div>

      {ess ? (
        <Link href="/logros" className={s.essential}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <b>{ess.artistName} esencial</b>
            <span>
              {ess.owned} / {ess.total}
            </span>
          </div>
          <div className={s.bars} style={{ gridTemplateColumns: `repeat(${ess.total}, 1fr)` }}>
            {Array.from({ length: ess.total }, (_, i) => (
              <div
                key={i}
                style={{
                  background: i < ess.owned ? 'var(--color-accent)' : 'var(--color-surface)',
                }}
              />
            ))}
          </div>
        </Link>
      ) : null}

      {item.notes || item.tags.length ? (
        <div className={s.info} style={{ fontSize: 14 }}>
          {item.notes ? <p style={{ margin: 0 }}>{item.notes}</p> : null}
          {item.tags.length ? (
            <div className={s.tags}>
              {item.tags.map((t) => (
                <Link
                  key={t}
                  href={`/coleccion?q=${encodeURIComponent(t)}`}
                  className="tag tag-outline"
                >
                  {t}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="kicker" style={{ padding: '14px 20px 6px' }}>
        Tracklist
      </div>
      {item.release.tracks.map((t) => (
        <TrackRowMobile
          key={t.id}
          track={t}
          open={open === t.id}
          onToggle={() => setOpen((o) => (o === t.id ? null : t.id))}
        />
      ))}
      {item.release.tracks.length === 0 ? (
        <div className="state" style={{ padding: '8px 20px 16px' }}>
          Sin tracklist cargado.
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid var(--color-divider)' }}>
        <MoreEditions item={item} />
      </div>

      {privateBits.length ? (
        <div style={{ padding: '14px 20px 0', borderTop: '1px solid var(--color-divider)' }}>
          <div className={s.privateBox}>
            <span>
              <b>Solo vos</b> · {privateBits.join(' · ')}
            </span>
            <span className={s.privateTag}>Privado</span>
          </div>
        </div>
      ) : null}
      <div
        style={{
          padding: '14px 20px 24px',
          borderTop: privateBits.length ? 0 : '1px solid var(--color-divider)',
          fontSize: 12,
          color: 'var(--color-neutral-700)',
        }}
      >
        Ubicación física y precio pagado: solo visibles para vos.
        {item.release.isVerified && item.release.external.some((e) => e.source === 'discogs')
          ? ' Datos provistos por Discogs.'
          : null}
      </div>
    </article>
  );
}
