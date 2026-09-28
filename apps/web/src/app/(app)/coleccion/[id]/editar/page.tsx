'use client';

import type { CollectionItem } from '@kollektor/api-client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Cover } from '@/components/Cover';
import { copyToFields, CopyForm, type CopyValues } from '@/components/CopyForm';
import { useToast } from '@/components/Toasts';
import s from '@/features/flow/flow.module.css';
import { AddPhoto, picturesOf } from '@/features/item/Photos';
import { coverOf } from '@/features/item/itemData';
import { api, errorMessage } from '@/lib/api';
import { editionLine } from '@kollektor/app-logic';
import { useInvalidateAll, useItem } from '@/lib/queries';

/** Editar los datos de mi copia, sus fotos, o borrarla. */
export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const { data: item } = useItem(id);
  if (!item) return <div className="state">Cargando…</div>;
  return <EditItem item={item} />;
}

function fromItem(item: CollectionItem): CopyValues {
  return {
    conditionMedia: item.conditionMedia,
    conditionSleeve: item.conditionSleeve,
    purchasePrice: item.purchasePrice != null ? String(item.purchasePrice).replace('.', ',') : '',
    purchaseCurrency: item.purchaseCurrency ?? item.value.baseCurrency ?? 'USD',
    purchaseDate: item.purchaseDate ?? '',
    purchasePlace: item.purchasePlace ?? '',
    notes: item.notes ?? '',
    storageLocation: item.storageLocation ?? '',
    tags: item.tags.join(', '),
    copyNumber: item.copyNumber ?? '',
  };
}

function EditItem({ item }: { item: CollectionItem }) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const [values, setValues] = useState(() => fromItem(item));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const r = item.release;
  const pics = picturesOf(item);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.collection.update(item.id, copyToFields(values));
      await invalidate();
      toast.celebrate(res.unlockedAchievements);
      router.replace(`/coleccion/${item.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.collection.remove(item.id);
      await invalidate();
      toast.show(`Sacaste ${r.album.title} de tu colección.`);
      router.replace('/coleccion');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className={s.screen}>
      <div className={s.bar}>
        <Link href={`/coleccion/${item.id}`} className={s.barBtn}>
          Cancelar
        </Link>
        <span className={s.barTitle}>Editar vinilo</span>
        <button type="button" className={s.barSide} onClick={() => setConfirm(true)}>
          Borrar
        </button>
      </div>
      <div className={s.body} style={{ borderTop: '2px solid var(--color-divider)' }}>
        <div className={s.summary}>
          <Cover url={coverOf(item)} size={72} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{r.album.title}</div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
              {r.album.artistDisplay} · {editionLine(r.country, r.releaseYear, r.editionType)}
            </div>
          </div>
        </div>
        <div className={s.form}>
          <CopyForm value={values} onChange={setValues} extended />
          <div>
            <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--color-neutral-700)' }}>
              Fotos de tu copia
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {pics.map((p) => (
                <div
                  key={p.url}
                  style={{ width: 64, height: 64, background: 'var(--color-surface)' }}
                >
                  <img
                    src={p.url}
                    alt={p.label}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
              <AddPhoto item={item} size={64} />
            </div>
          </div>
          {error ? <div className={s.error}>{error}</div> : null}
        </div>
        <div style={{ flex: 1 }} />
        <div className={`${s.foot} ${s.footRule}`}>
          <button type="button" className="btn btn-primary cta" disabled={busy} onClick={save}>
            <span>{busy ? 'Guardando…' : 'Guardar cambios'}</span>
            <span>✓</span>
          </button>
        </div>
      </div>

      {confirm ? (
        <div className="dialog-backdrop" style={{ zIndex: 50 }} onClick={() => setConfirm(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-title">¿Sacar este disco de tu colección?</div>
            <div className="dialog-body">
              {r.album.title} — {r.album.artistDisplay}. Los logros que ya desbloqueaste se
              conservan.
            </div>
            <div className="dialog-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={remove}>
                Borrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
