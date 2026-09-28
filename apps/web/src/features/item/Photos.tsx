'use client';

import type { CollectionItem } from '@kollektor/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useToast } from '@/components/Toasts';
import { api, errorMessage } from '@/lib/api';
import { keys } from '@/lib/queries';
import s from './item.module.css';

export { picturesOf, type Picture } from '@kollektor/app-logic';

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
