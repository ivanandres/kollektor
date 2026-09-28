'use client';

import type { CollectionItem } from '@kollektor/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { api, errorMessage } from '@/lib/api';
import { keys } from '@/lib/queries';
import { coverOf } from './itemData';
import s from './item.module.css';

export interface Picture {
  url: string;
  label: string;
}

/** Edition images from the catalog followed by the owner's photos of this copy. */
export function picturesOf(item: CollectionItem): Picture[] {
  const release = item.release.images.map((img, i) => ({
    url: img.url,
    label: img.kind === 'primary' ? 'portada' : `imagen ${i + 1}`,
  }));
  const own = item.photos.map((p) => ({ url: p.url, label: p.caption ?? 'tu foto' }));
  // No edition images: fall back to the album cover, like the collection list does.
  const cover = release.length ? null : coverOf(item);
  return [...(cover ? [{ url: cover, label: 'portada' }] : []), ...release, ...own];
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** "+" tile: upload a photo of this copy (label, worn sleeve…) straight to storage. */
export function AddPhoto({ item, size }: { item: CollectionItem; size?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const type = TYPES.find((t) => t === file.type);
    if (!type) return toast.show('Subí una foto JPG, PNG o WebP.', 'error');
    if (file.size > 5 * 1024 * 1024) return toast.show('La foto pesa más de 5 MB.', 'error');
    setBusy(true);
    try {
      const target = await api.collection.photoUpload(item.id, type);
      const url = await api.upload(target, file);
      await api.collection.addPhoto(item.id, url);
      await qc.invalidateQueries({ queryKey: keys.item(item.id) });
      toast.show('Foto agregada.');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${s.thumb} ${s.addThumb}`}
        style={size ? { width: size } : undefined}
        aria-label="Agregar foto de tu copia"
        disabled={busy || item.photos.length >= 10}
        onClick={() => input.current?.click()}
      >
        {busy ? '…' : '+'}
      </button>
      <input
        ref={input}
        type="file"
        accept={TYPES.join(',')}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </>
  );
}
