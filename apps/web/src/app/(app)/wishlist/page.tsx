'use client';

import type { WishlistItem } from '@kollektor/api-client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Cover } from '@/components/Cover';
import {
  copyToFields,
  CopyForm,
  emptyCopy,
  parseAmount,
  type CopyValues,
} from '@/components/CopyForm';
import { useToast } from '@/components/Toasts';
import { api, errorMessage } from '@/lib/api';
import { editionLine, money, num, PRIORITY_LABEL } from '@/lib/format';
import { useInvalidateAll, useProfile, useWishlist } from '@/lib/queries';
import s from './wishlist.module.css';

type Status = WishlistItem['status'];
const TABS: { status: Status; label: string }[] = [
  { status: 'wanted', label: 'Quiero' },
  { status: 'searching', label: 'Buscando' },
  { status: 'found', label: 'Encontrado' },
  { status: 'purchased', label: 'Comprado' },
];

const edLabel = (w: WishlistItem) =>
  w.release
    ? editionLine(w.release.country, w.release.releaseYear, w.release.editionType)
    : 'Cualquier edición';

/** 1j — Wishlist "Quiero comprar" por estado. */
export default function WishlistPage() {
  const { data, isPending } = useWishlist();
  const [tab, setTab] = useState<Status>('wanted');
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [buying, setBuying] = useState<WishlistItem | null>(null);
  const items = (data ?? []).filter((w) => w.status === tab);
  const count = (st: Status) => (data ?? []).filter((w) => w.status === st).length;

  return (
    <div className={s.page}>
      <div className={s.head}>
        <div className={s.title}>Quiero comprar</div>
        <Link href="/agregar?destino=wishlist" className={s.plus} aria-label="Sumar a la wishlist">
          +
        </Link>
      </div>
      <div className={s.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.status}
            type="button"
            role="tab"
            aria-selected={tab === t.status}
            onClick={() => setTab(t.status)}
          >
            {t.label} <span style={{ fontWeight: 400, opacity: 0.75 }}>{count(t.status)}</span>
          </button>
        ))}
      </div>
      <div>
        {isPending ? (
          <div className="state">Cargando…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '28px 20px', fontSize: 14, color: 'var(--color-neutral-700)' }}>
            Nada en este estado todavía.
            {tab === 'wanted' ? (
              <>
                {' '}
                <Link href="/agregar?destino=wishlist">Sumá un disco →</Link>
              </>
            ) : null}
          </div>
        ) : (
          items.map((w) => (
            <div key={w.id} className={s.item}>
              <Cover url={w.album.coverImageUrl} size={72} />
              <div>
                <button
                  type="button"
                  className={s.itemMain}
                  onClick={() => (w.status === 'purchased' ? null : setEditing(w))}
                  aria-label={`Editar ${w.album.title}`}
                >
                  <div className={s.row}>
                    <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>
                      {w.album.title}
                    </div>
                    <span
                      className={s.prio}
                      style={{
                        color:
                          w.priority === 1 ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
                      }}
                    >
                      {PRIORITY_LABEL[w.priority] ?? ''}
                    </span>
                  </div>
                  <div className={s.meta}>
                    {w.album.artistDisplay} · {edLabel(w)}
                  </div>
                  <div className={s.row} style={{ fontSize: 12, marginTop: 6 }}>
                    <span>
                      Objetivo{' '}
                      <b>{w.targetPrice != null ? money(w.targetPrice, w.targetCurrency) : '—'}</b>
                    </span>
                    <span
                      style={{
                        color: w.belowTarget
                          ? 'var(--color-accent-700)'
                          : 'var(--color-neutral-700)',
                        fontWeight: w.belowTarget ? 600 : 400,
                      }}
                    >
                      {w.market
                        ? `Mercado ~${money(w.market.lowest, w.market.currency)}`
                        : 'Mercado —'}
                    </span>
                  </div>
                  {w.belowTarget || w.ownedEditions > 0 ? (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {w.belowTarget ? (
                        <span className="tag tag-accent">¡Está a tu precio!</span>
                      ) : null}
                      {w.ownedEditions > 0 ? (
                        <span className="tag tag-neutral">
                          Ya tenés{' '}
                          {w.ownedEditions === 1 ? 'otra edición' : `${w.ownedEditions} ediciones`}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </button>
                {w.status === 'found' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{
                      marginTop: 10,
                      width: '100%',
                      justifyContent: 'space-between',
                      minHeight: 44,
                    }}
                    onClick={() => setBuying(w)}
                  >
                    <span>Agregar a mi colección</span>
                    <span>→</span>
                  </button>
                ) : null}
                {w.status === 'purchased' && w.collectionItemId ? (
                  <Link
                    href={`/coleccion/${w.collectionItemId}`}
                    className="btn btn-secondary"
                    style={{
                      marginTop: 10,
                      width: '100%',
                      justifyContent: 'space-between',
                      minHeight: 44,
                    }}
                  >
                    <span>Ver en mi colección</span>
                    <span>→</span>
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
      {editing ? (
        <EditSheet
          item={editing}
          onClose={() => setEditing(null)}
          onBuy={() => {
            setBuying(editing);
            setEditing(null);
          }}
        />
      ) : null}
      {buying ? <BuySheet item={buying} onClose={() => setBuying(null)} /> : null}
    </div>
  );
}

function useSheetLock(onClose: () => void) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
}

function SegRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="kicker" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div
        className="toggle"
        style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)`, gridAutoFlow: 'unset' }}
      >
        {options.map(([v, l]) => (
          <button
            key={String(v)}
            type="button"
            aria-pressed={v === value}
            style={{ padding: '12px 0', fontSize: 13, fontWeight: 600 }}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Tap an item: change state, priority, target price, buy or remove. */
function EditSheet({
  item,
  onClose,
  onBuy,
}: {
  item: WishlistItem;
  onClose: () => void;
  onBuy: () => void;
}) {
  useSheetLock(onClose);
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [status, setStatus] = useState<Exclude<Status, 'purchased'>>(
    item.status === 'purchased' ? 'found' : item.status,
  );
  const [priority, setPriority] = useState(item.priority);
  const [target, setTarget] = useState(item.targetPrice != null ? String(item.targetPrice) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const price = parseAmount(target);
      await api.wishlist.update(item.id, {
        status,
        priority,
        targetPrice: price,
        targetCurrency:
          price != null ? (item.targetCurrency ?? profile?.baseCurrency ?? 'USD') : null,
      });
      await invalidate();
      onClose();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.wishlist.remove(item.id);
      await invalidate();
      toast.show(`Sacaste ${item.album.title} de tu wishlist.`);
      onClose();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={item.album.title}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>
              {item.album.title}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {item.album.artistDisplay} · {edLabel(item)}
            </div>
          </div>
          <button
            type="button"
            className="link"
            style={{ fontSize: 13 }}
            onClick={remove}
            disabled={busy}
          >
            Quitar
          </button>
        </div>
        <SegRow
          label="Estado"
          value={status}
          onChange={setStatus}
          options={[
            ['wanted', 'Quiero'],
            ['searching', 'Buscando'],
            ['found', 'Encontrado'],
          ]}
        />
        <SegRow
          label="Prioridad"
          value={priority}
          onChange={setPriority}
          options={[
            [1, 'Alta'],
            [2, 'Media'],
            [3, 'Baja'],
          ]}
        />
        <div className="field">
          <label htmlFor="w-target">
            Precio objetivo ({item.targetCurrency ?? profile?.baseCurrency ?? 'USD'})
          </label>
          <input
            id="w-target"
            className="input"
            style={{ minHeight: 48, fontSize: 18, fontWeight: 700 }}
            inputMode="decimal"
            value={target}
            placeholder="0"
            onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </div>
        {item.market ? (
          <div style={{ padding: '10px 12px', background: 'var(--color-surface)', fontSize: 12 }}>
            La copia más barata a la venta hoy:{' '}
            <b>{money(item.market.lowest, item.market.currency)}</b> · Discogs Marketplace.
          </div>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary cta"
          style={{ fontWeight: 800 }}
          disabled={busy}
          onClick={save}
        >
          <span>Guardar</span>
          <span>✓</span>
        </button>
        <button type="button" className="btn btn-primary cta" disabled={busy} onClick={onBuy}>
          <span>Lo compré — agregar a mi colección</span>
          <span>→</span>
        </button>
      </div>
    </>
  );
}

/** "Lo compré": completes the copy data and moves it to the collection. */
function BuySheet({ item, onClose }: { item: WishlistItem; onClose: () => void }) {
  useSheetLock(onClose);
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [values, setValues] = useState<CopyValues>(() => ({
    ...emptyCopy(profile?.baseCurrency ?? 'USD'),
    purchasePrice: item.market ? num(item.market.lowest) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const edition = item.release
        ? {}
        : item.album.mainReleaseId
          ? { releaseId: item.album.mainReleaseId }
          : {};
      const res = await api.wishlist.purchase(item.id, { ...edition, ...copyToFields(values) });
      await invalidate();
      toast.show(`Agregaste ${item.album.title} a tu colección.`);
      toast.celebrate(res.unlockedAchievements);
      router.push(`/coleccion/${res.item.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Agregar a mi colección">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '56px 1fr',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <Cover url={item.album.coverImageUrl} size={56} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.15 }}>
              {item.album.title}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {item.album.artistDisplay} · {edLabel(item)}
            </div>
          </div>
        </div>
        <CopyForm value={values} onChange={setValues} />
        {error ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-accent-700)' }}>
            {error}
          </div>
        ) : null}
        <button type="button" className="btn btn-primary cta" disabled={busy} onClick={buy}>
          <span>{busy ? 'Guardando…' : 'Guardar en colección'}</span>
          <span>✓</span>
        </button>
      </div>
    </>
  );
}
