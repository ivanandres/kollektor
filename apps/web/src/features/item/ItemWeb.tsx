'use client';

import type { CollectionItem } from '@kollektor/api-client';
import Link from 'next/link';
import { useState } from 'react';
import { Cover } from '@/components/Cover';
import { NavActions } from '@/components/Nav';
import { duration, money, signed } from '@kollektor/app-logic';
import { useEssentials } from '@/lib/queries';
import { essentialFor, metaRows, tags, totalDuration, valueNote } from './itemData';
import { MoreEditions } from './MoreEditions';
import { AddPhoto, picturesOf } from './Photos';
import { TrackRowWeb } from './Tracks';
import s from './item.module.css';

/** 1n — Ficha web: portada + datos + tracklist con links. */
export function ItemWeb({ item }: { item: CollectionItem }) {
  const { data: essentials } = useEssentials();
  const pics = picturesOf(item);
  const [pic, setPic] = useState(0);
  const cover = pics[pic]?.url ?? null;
  const v = item.value;
  const cur = v.baseCurrency;
  const ess = essentialFor(item, essentials);
  const total = totalDuration(item);
  const privateBits = [
    item.storageLocation,
    item.purchasePlace ? `comprado en ${item.purchasePlace}` : null,
  ].filter(Boolean);
  const nextMissing = ess?.missing[0];

  return (
    <article className={s.web}>
      <NavActions>
        <Link
          href={`/coleccion/${item.id}/editar`}
          className="btn btn-secondary"
          style={{ minHeight: 38 }}
        >
          Editar
        </Link>
      </NavActions>

      <div>
        <Cover url={cover} stripe={9} label={cover ? null : 'portada · frente'} />
        <div
          style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 8 }}
        >
          {pics.slice(0, 7).map((p, i) => (
            <button
              key={p.url}
              type="button"
              className={s.thumb}
              aria-pressed={i === pic}
              aria-label={p.label}
              onClick={() => setPic(i)}
            >
              <img src={p.url} alt="" />
            </button>
          ))}
          {pics.length === 0 ? (
            <div
              className={s.thumb}
              aria-pressed="true"
              style={{ outline: '2px solid var(--color-text)', outlineOffset: -2 }}
            />
          ) : null}
          <AddPhoto item={item} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 6 }}>
          {pics.length
            ? pics
                .slice(0, 7)
                .map((p) => p.label)
                .join(' · ')
            : 'Sin imágenes todavía · sumá fotos de tu copia (etiqueta, dorso…)'}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{item.release.album.artistDisplay}</div>
        <h1 className={s.wTitle}>{item.release.album.title}</h1>
        <div className={s.tags} style={{ marginTop: 14 }}>
          {tags(item).map((t) => (
            <span key={t.label} className={`tag tag-${t.kind}`}>
              {t.label}
            </span>
          ))}
        </div>
        <div style={{ height: 2, background: 'var(--color-divider)', margin: '22px 0 0' }} />
        <div className={s.wValues}>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Pagaste
            </div>
            <div className={s.wVal}>{money(v.paid, cur)}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Valor estimado
            </div>
            <div className={s.wVal}>{money(v.estimated, cur)}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Diferencia
            </div>
            <div
              className={`${s.wVal} ${v.difference != null && v.difference < 0 ? 'neg' : 'pos'}`}
            >
              {signed(v.difference)}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-neutral-700)', marginTop: 6 }}>
          {valueNote(item, true)}
        </div>
        <div className={s.wMeta}>
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
        {item.notes ? <p style={{ fontSize: 14, margin: '14px 0 0' }}>{item.notes}</p> : null}
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
        <div className={s.privateBox} style={{ marginTop: 16 }}>
          <span>
            <b>Solo vos</b>
            {privateBits.length
              ? ` · ${privateBits.join(' · ')}`
              : ' · sin ubicación ni lugar de compra cargados'}
          </span>
          <span className={s.privateTag}>Privado</span>
        </div>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 8,
          }}
        >
          <span className="kicker">Tracklist</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {total != null ? duration(total) : `${item.release.tracks.length} temas`}
          </span>
        </div>
        {item.release.tracks.map((t) => (
          <TrackRowWeb key={t.id} track={t} />
        ))}
        {item.release.tracks.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: '8px 0' }}>
            Sin tracklist cargado.
          </div>
        ) : null}
        {ess ? (
          <Link href="/logros" className={s.essentialBox}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {ess.artistName} esencial · {ess.owned} / {ess.total}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
              {ess.complete
                ? 'Completaste la discografía esencial.'
                : ess.missing.length === 1 && nextMissing
                  ? `Te falta ${nextMissing.title} para el badge completo.`
                  : `Te faltan ${ess.total - ess.owned} para el badge completo.`}
            </div>
          </Link>
        ) : null}
        <MoreEditions item={item} web />
        {item.release.external.some((e) => e.source === 'discogs') ? (
          <div className="muted" style={{ fontSize: 11, marginTop: 14 }}>
            Datos provistos por Discogs.
          </div>
        ) : null}
      </div>
    </article>
  );
}
