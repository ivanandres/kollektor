'use client';

import type { CollectionItem, TrackLinks } from '@kollektor/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/Toasts';
import { api } from '@/lib/api';
import { duration } from '@kollektor/app-logic';
import { keys, useTrackLinks } from '@/lib/queries';
import s from './item.module.css';

type Track = CollectionItem['release']['tracks'][number];
type Link = TrackLinks['links'][string] | TrackLinks['lyrics'];

const found = (l: Link | undefined): l is { status: 'found'; url: string; confidence: number } =>
  l?.status === 'found';

/** 1i — tap a track to reveal Spotify / YouTube / letra. Links are looked up on demand. */
export function TrackRowMobile({
  track,
  open,
  onToggle,
}: {
  track: Track;
  open: boolean;
  onToggle: () => void;
}) {
  const { data, isPending, isError } = useTrackLinks(track.id, open);
  const sp = data?.links.spotify;
  const yt = data?.links.youtube;
  return (
    <div style={{ borderTop: '1px solid var(--color-divider)' }} id={`tema-${track.id}`}>
      <button
        type="button"
        className={`row-btn ${s.track}`}
        aria-expanded={open}
        onClick={onToggle}
        style={{ background: open ? 'var(--color-surface)' : 'transparent' }}
      >
        <span className={s.trackPos}>{track.position}</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{track.title}</span>
        <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
          {duration(track.durationSeconds)}
        </span>
      </button>
      {open ? (
        <div className={s.trackLinks}>
          {isPending ? (
            <span style={{ fontSize: 12, color: 'var(--color-neutral-700)', padding: '6px 0' }}>
              Buscando links…
            </span>
          ) : isError ? (
            <span style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
              No pudimos buscar los links. Probá más tarde.
            </span>
          ) : (
            <>
              {found(sp) ? (
                <a
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  href={sp.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Spotify ↗
                </a>
              ) : null}
              {found(yt) ? (
                <a
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  href={yt.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  YouTube ↗
                </a>
              ) : null}
              {found(data?.lyrics) ? (
                <a
                  className="btn btn-ghost"
                  style={{ fontSize: 12 }}
                  href={data.lyrics.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver letra ↗
                </a>
              ) : null}
              {missingText(data)}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function missingText(data: TrackLinks | undefined) {
  if (!data) return null;
  if (Object.keys(data.links).length === 0 && !found(data.lyrics))
    return <span className={s.trackMiss}>Los links de música no están disponibles por ahora.</span>;
  const miss: string[] = [];
  if (data.links.spotify && !found(data.links.spotify)) miss.push('Spotify');
  if (data.links.youtube && !found(data.links.youtube)) miss.push('YouTube');
  const none = !found(data.links.spotify) && !found(data.links.youtube) && !found(data.lyrics);
  if (none)
    return <span className={s.trackMiss}>No encontramos este tema en Spotify ni YouTube.</span>;
  if (miss.length)
    return <span className={s.trackMiss}>No encontramos este tema en {miss.join(' ni ')}.</span>;
  return null;
}

/** 1n — tracklist row with link chips; links are fetched on hover and opened on click. */
export function TrackRowWeb({ track }: { track: Track }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useTrackLinks(track.id, false);
  const prefetch = () =>
    qc.prefetchQuery({
      queryKey: keys.trackLinks(track.id),
      queryFn: () => api.catalog.trackLinks(track.id),
      staleTime: Infinity,
    });

  async function openLink(kind: 'spotify' | 'youtube' | 'lyrics', label: string) {
    // Open synchronously (popup blockers), then point it at the link once we have it.
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null; // the external page must not control this tab
    try {
      const links = await qc.fetchQuery({
        queryKey: keys.trackLinks(track.id),
        queryFn: () => api.catalog.trackLinks(track.id),
        staleTime: Infinity,
      });
      const l = kind === 'lyrics' ? links.lyrics : links.links[kind];
      if (found(l)) {
        if (win) win.location.href = l.url;
        else window.open(l.url, '_blank');
      } else {
        win?.close();
        toast.show(`No encontramos este tema en ${label}.`);
      }
    } catch {
      win?.close();
      toast.show('No pudimos buscar los links. Probá más tarde.', 'error');
    }
  }

  const chip = (kind: 'spotify' | 'youtube', label: string) => {
    const l = data?.links[kind];
    if (data && !l) return null; // service not configured
    if (l && !found(l))
      return (
        <span style={{ padding: '3px 6px', color: 'var(--color-neutral-600)', fontWeight: 400 }}>
          sin {label}
        </span>
      );
    return (
      <button type="button" className={s.chip} onClick={() => openLink(kind, label)}>
        {label}
      </button>
    );
  };

  return (
    <div className={s.wTrack} onMouseEnter={prefetch} id={`tema-${track.id}`}>
      <span className={s.trackPos} style={{ fontSize: 11 }}>
        {track.position}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{track.title}</span>
      <span
        style={{ display: 'flex', gap: 4, fontSize: 11, fontWeight: 600, alignItems: 'center' }}
      >
        {chip('spotify', 'Spotify')}
        {chip('youtube', 'YouTube')}
        {data && !found(data.lyrics) ? null : (
          <button
            type="button"
            className={s.chip}
            style={{ border: 0, color: 'var(--color-accent-700)' }}
            onClick={() => openLink('lyrics', 'Genius')}
          >
            Letra
          </button>
        )}
      </span>
    </div>
  );
}
