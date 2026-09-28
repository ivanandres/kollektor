'use client';

import type { CollectionItem } from '@kollektor/api-client';
import Link from 'next/link';
import s from './item.module.css';

/** Ficha footer actions: link a manual record to Discogs, or browse other editions of the album. */
export function MoreEditions({ item, web = false }: { item: CollectionItem; web?: boolean }) {
  const album = item.release.album;
  const q = `${album.artistDisplay} ${album.title}`;
  const manual = !item.release.isVerified;
  return (
    <div
      style={{
        padding: web ? '16px 0 0' : '14px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {manual ? (
        <Link
          href={`/agregar?vincular=${item.id}&q=${encodeURIComponent(q)}`}
          className={s.essentialBox}
          style={{ marginTop: 0 }}
        >
          <div style={{ fontSize: 12, fontWeight: 600 }}>Cargado a mano</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>
            Vinculalo con Discogs para traer tracklist, portada y valor →
          </div>
        </Link>
      ) : (
        <Link
          href={`/agregar?album=${album.id}&titulo=${encodeURIComponent(`${album.artistDisplay} — ${album.title}`)}`}
          className="btn btn-secondary cta"
          style={{ fontWeight: 800, minHeight: 48 }}
        >
          <span>Otras ediciones de este álbum</span>
          <span>→</span>
        </Link>
      )}
    </div>
  );
}
