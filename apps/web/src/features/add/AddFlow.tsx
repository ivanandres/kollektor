'use client';

import type { ExternalCandidate, IdentifyResult } from '@kollektor/api-client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Cover } from '@/components/Cover';
import { copyToFields, CopyForm, emptyCopy, type CopyValues } from '@/components/CopyForm';
import { useToast } from '@/components/Toasts';
import s from '@/features/flow/flow.module.css';
import { api, ApiError, errorMessage } from '@/lib/api';
import { countryEs } from '@/lib/filters';
import { money } from '@/lib/format';
import { useInvalidateAll, useProfile } from '@/lib/queries';
import { barcodeDetector, toBase64, toJpeg, useCamera } from './camera';

type Source =
  | { kind: 'photo'; hints: IdentifyResult['hints']; remaining: number | null }
  | { kind: 'barcode'; barcode: string }
  | { kind: 'text'; q: string }
  | { kind: 'versions'; title: string };

const STEPS = ['Foto', 'Edición', 'Compra'] as const;

/** 1g — Identificar con cámara, en 3 pasos: Foto → Edición → Compra. */
export function AddFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const toWishlist = params.get('destino') === 'wishlist';
  /** Buying a wishlist item: the chosen edition closes that item instead of adding a new one. */
  const wishlistId = params.get('wishlist');
  const initialQ = params.get('q');
  const [step, setStep] = useState<0 | 1 | 2>(initialQ ? 1 : 0);
  const [source, setSource] = useState<Source | null>(null);
  const [cands, setCands] = useState<ExternalCandidate[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runText = async (q: string) => {
    setError(null);
    setBusy('Buscando en Discogs…');
    setSource({ kind: 'text', q });
    try {
      const res = await api.catalog.searchExternal({ q, type: 'release', perPage: 25 });
      setCands(res.items);
      setSel(0);
      setStep(1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (initialQ) void runText(initialQ);
    // run once for the ?q= deep link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const identified = (res: IdentifyResult, src: Source) => {
    setSource(src);
    setCands(res.candidates);
    setSel(0);
    setStep(1);
  };

  const identifyPhotos = async (blobs: Blob[]) => {
    setError(null);
    setBusy('Identificando…');
    try {
      const images = await Promise.all(
        blobs.slice(0, 3).map(async (b) => ({
          data: await toBase64(await toJpeg(b)),
          mediaType: 'image/jpeg' as const,
        })),
      );
      const res = await api.catalog.identifyPhoto(images);
      identified(res, { kind: 'photo', hints: res.hints, remaining: res.remainingToday });
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NOT_CONFIGURED'
          ? 'El reconocimiento por foto no está disponible. Probá con el código de barras o buscá por texto.'
          : errorMessage(e),
      );
    } finally {
      setBusy(null);
    }
  };

  const identifyBarcode = async (barcode: string) => {
    setError(null);
    setBusy('Buscando el código…');
    try {
      const res = await api.catalog.identifyBarcode(barcode);
      identified(res, { kind: 'barcode', barcode });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const loadVersions = async (c: ExternalCandidate) => {
    if (!c.masterId) return;
    setBusy('Buscando ediciones…');
    try {
      const res = await api.catalog.masterVersions(c.masterId);
      setSource({ kind: 'versions', title: [c.artist, c.title].filter(Boolean).join(' — ') });
      setCands(res.items);
      setSel(0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const back = () => {
    if (step === 0) return window.history.length > 1 ? router.back() : router.push('/');
    setStep((x) => (x - 1) as 0 | 1);
    setError(null);
  };

  const chosen = cands[sel];

  return (
    <div className={s.screen}>
      <div className={s.bar}>
        <button type="button" className={s.barBtn} onClick={back}>
          {step ? '← Atrás' : 'Cerrar'}
        </button>
        <span className={s.barTitle}>{toWishlist ? 'Sumar a la wishlist' : 'Agregar vinilo'}</span>
        <Link
          href={toWishlist ? '/agregar/manual?destino=wishlist' : '/agregar/manual'}
          className={s.barSide}
        >
          Manual
        </Link>
      </div>
      <div className={s.steps}>
        {STEPS.map((label, i) => {
          const style =
            i === step
              ? { background: 'var(--color-accent)', color: 'var(--color-bg)' }
              : i < step
                ? { background: 'var(--color-surface)', color: 'var(--color-text)' }
                : { background: 'transparent', color: 'var(--color-neutral-600)' };
          return (
            <button
              key={label}
              type="button"
              style={style}
              disabled={i > step || (toWishlist && i === 2)}
              onClick={() => i < step && setStep(i as 0 | 1)}
            >
              0{i + 1} {label}
            </button>
          );
        })}
      </div>

      {step === 0 ? (
        <PhotoStep
          busy={busy}
          error={error}
          onPhotos={identifyPhotos}
          onBarcode={identifyBarcode}
          onText={runText}
        />
      ) : step === 1 ? (
        <EditionStep
          source={source}
          cands={cands}
          sel={sel}
          onSelect={setSel}
          busy={busy}
          error={error}
          toWishlist={toWishlist}
          onVersions={loadVersions}
          onNext={() => setStep(2)}
        />
      ) : chosen ? (
        <PurchaseStep cand={chosen} wishlistId={wishlistId} />
      ) : null}
    </div>
  );
}

// ─── 01 Foto ───

function PhotoStep({
  busy,
  error,
  onPhotos,
  onBarcode,
  onText,
}: {
  busy: string | null;
  error: string | null;
  onPhotos: (b: Blob[]) => void;
  onBarcode: (code: string) => void;
  onText: (q: string) => void;
}) {
  const [mode, setMode] = useState<'photo' | 'barcode' | 'text'>('photo');
  const { video, state, capture } = useCamera(true);
  const file = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const detector = useMemo(() => (typeof window === 'undefined' ? null : barcodeDetector()), []);

  // Live barcode scanning where the browser supports it. Each code is sent once per scan
  // session, so a failed lookup doesn't re-fire while the code stays in frame.
  const onBarcodeRef = useRef(onBarcode);
  onBarcodeRef.current = onBarcode;
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (mode !== 'barcode') tried.current.clear();
  }, [mode]);
  useEffect(() => {
    if (mode !== 'barcode' || !detector || state !== 'live' || busy) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop || !video.current) return;
      try {
        const codes = await detector.detect(video.current);
        if (stop) return;
        const code = codes[0]?.rawValue;
        if (code && !tried.current.has(code)) {
          tried.current.add(code);
          return onBarcodeRef.current(code);
        }
      } catch {
        // frame not ready
      }
      if (!stop) timer = setTimeout(tick, 300);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [mode, detector, state, busy, video]);

  const shoot = async () => {
    if (state !== 'live') return file.current?.click();
    const b = await capture();
    if (b) onPhotos([b]);
  };

  const hint =
    mode === 'barcode'
      ? detector && state === 'live'
        ? 'Apuntá al código de barras del dorso. Lo leemos solos.'
        : 'Escribí los números del código de barras (EAN/UPC) del dorso.'
      : mode === 'text'
        ? 'Buscá por artista, título, sello o número de catálogo.'
        : 'Encuadrá la portada. También podés fotografiar la etiqueta o el back cover para afinar la edición.';

  return (
    <div className={s.viewfinderWrap}>
      <div className={s.viewfinder}>
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          style={{ display: state === 'live' ? 'block' : 'none' }}
        />
        <div className={s.frame} style={mode === 'barcode' ? { height: 140 } : undefined} />
        <div className={s.vfLabel}>
          {busy ??
            (state === 'live'
              ? mode === 'barcode'
                ? 'buscando código…'
                : ''
              : state === 'denied'
                ? 'sin permiso de cámara · subí una foto'
                : state === 'unavailable'
                  ? 'cámara no disponible · subí una foto'
                  : 'visor de cámara')}
        </div>
      </div>
      <div style={{ padding: '14px 20px', fontSize: 13 }}>
        {hint}
        {mode === 'barcode' && !(detector && state === 'live') ? (
          <InlineInput
            placeholder="7 798141 234567"
            inputMode="numeric"
            onSubmit={(v) => onBarcode(v.replace(/\D/g, ''))}
            value={typed}
            setValue={setTyped}
          />
        ) : null}
        {mode === 'text' ? (
          <InlineInput
            placeholder="Pink Floyd Meddle"
            onSubmit={onText}
            value={typed}
            setValue={setTyped}
            autoFocus
          />
        ) : null}
        {error ? (
          <div
            style={{ marginTop: 8, color: 'var(--color-accent-400)', fontWeight: 600 }}
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 12, opacity: 0.8 }}>
          {mode !== 'photo' ? (
            <button
              type="button"
              className={s.barSide}
              style={{ color: 'inherit' }}
              onClick={() => setMode('photo')}
            >
              ← Foto de la portada
            </button>
          ) : null}
          {mode !== 'text' ? (
            <button
              type="button"
              className={s.barSide}
              style={{ color: 'inherit', textDecoration: 'underline' }}
              onClick={() => (setMode('text'), setTyped(''))}
            >
              Buscar por texto
            </button>
          ) : null}
        </div>
      </div>
      <div className={s.shutterRow}>
        <button type="button" onClick={() => file.current?.click()} disabled={!!busy}>
          Subir foto
        </button>
        <button
          type="button"
          className={s.shutter}
          aria-label="Sacar foto"
          disabled={!!busy}
          onClick={shoot}
        >
          <span />
        </button>
        <button
          type="button"
          onClick={() => (setMode(mode === 'barcode' ? 'photo' : 'barcode'), setTyped(''))}
          disabled={!!busy}
        >
          {mode === 'barcode' ? 'Portada' : 'Barcode'}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onPhotos(files);
        }}
      />
    </div>
  );
}

function InlineInput({
  value,
  setValue,
  onSubmit,
  placeholder,
  inputMode,
  autoFocus,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: (v: string) => void;
  placeholder: string;
  inputMode?: 'numeric' | 'text';
  autoFocus?: boolean;
}) {
  return (
    <form
      style={{ display: 'flex', gap: 8, marginTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
    >
      <input
        className="input"
        style={{ minHeight: 44, fontSize: 16 }}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoFocus={autoFocus}
      />
      <button className="btn btn-primary" style={{ minHeight: 44 }}>
        Buscar
      </button>
    </form>
  );
}

// ─── 02 Edición ───

function ownershipNote(c: ExternalCandidate): { text: string; strong: boolean } | null {
  if (c.ownedCopies > 0)
    return {
      text:
        c.ownedCopies === 1
          ? 'Ya tenés esta edición'
          : `Ya tenés ${c.ownedCopies} copias de esta edición`,
      strong: true,
    };
  if (c.ownedEditionsOfAlbum > 0)
    return { text: 'Tenés otra edición de este álbum', strong: false };
  if (c.inWishlist) return { text: 'Está en tu wishlist', strong: false };
  return null;
}

function EditionStep({
  source,
  cands,
  sel,
  onSelect,
  busy,
  error,
  toWishlist,
  onVersions,
  onNext,
}: {
  source: Source | null;
  cands: ExternalCandidate[];
  sel: number;
  onSelect: (i: number) => void;
  busy: string | null;
  error: string | null;
  toWishlist: boolean;
  onVersions: (c: ExternalCandidate) => void;
  onNext: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const [adding, setAdding] = useState(false);
  const chosen = cands[sel];
  const mixed = new Set(cands.map((c) => `${c.artist}|${c.title}`)).size > 1;
  const head =
    source?.kind === 'photo'
      ? {
          k: 'Identificado',
          t: [source.hints?.artist, source.hints?.title].filter(Boolean).join(' — ') || 'Foto',
        }
      : source?.kind === 'barcode'
        ? { k: 'Código de barras', t: source.barcode }
        : source?.kind === 'versions'
          ? { k: 'Todas las ediciones', t: source.title }
          : { k: 'Búsqueda', t: source?.kind === 'text' ? source.q : '' };
  const manualParams = new URLSearchParams();
  if (source?.kind === 'photo' && source.hints) {
    if (source.hints.artist) manualParams.set('artista', source.hints.artist);
    if (source.hints.title) manualParams.set('titulo', source.hints.title);
  }
  if (source?.kind === 'barcode') manualParams.set('barcode', source.barcode);
  if (toWishlist) manualParams.set('destino', 'wishlist');
  const manualHref = `/agregar/manual${manualParams.size ? `?${manualParams}` : ''}`;

  async function addToWishlist() {
    if (!chosen) return;
    setAdding(true);
    try {
      await api.wishlist.add({ discogsReleaseId: Number(chosen.externalId), priority: 2 });
      await invalidate();
      toast.show(`Sumaste ${chosen.title} a tu wishlist.`);
      router.push('/wishlist');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setAdding(false);
    }
  }

  return (
    <div className={s.body} style={{ overflow: 'auto' }}>
      <div style={{ padding: '16px 20px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker" style={{ color: 'var(--color-accent-700)' }}>
          {head.k}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>{head.t}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {busy
            ? busy
            : cands.length === 0
              ? 'No encontramos ediciones en Discogs. Probá otra foto, el código de barras o cargalo a mano.'
              : `Encontramos ${cands.length} ${cands.length === 1 ? 'edición posible' : 'ediciones posibles'} en Discogs. Elegí la tuya: mirá sello y catálogo en la etiqueta.`}
          {source?.kind === 'photo' && source.remaining != null && source.remaining <= 5
            ? ` Te quedan ${source.remaining} identificaciones por foto hoy.`
            : ''}
        </div>
        {error ? (
          <div className={s.error} style={{ marginTop: 6 }}>
            {error}
          </div>
        ) : null}
      </div>
      <div role="radiogroup" aria-label="Ediciones">
        {cands.map((c, i) => {
          const on = i === sel;
          const note = ownershipNote(c);
          return (
            <button
              key={`${c.type}-${c.externalId}`}
              type="button"
              role="radio"
              aria-checked={on}
              className={`row-btn ${s.cand}`}
              style={{
                background: on ? 'var(--color-accent-100)' : 'transparent',
                display: 'grid',
              }}
              onClick={() => onSelect(i)}
            >
              <span
                className={s.radio}
                style={
                  on
                    ? {
                        background: 'var(--color-accent)',
                        boxShadow: 'inset 0 0 0 3px var(--color-bg)',
                      }
                    : undefined
                }
              />
              <Cover url={c.thumbUrl ?? c.coverUrl} size={64} />
              <span>
                {mixed ? (
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
                    {[c.artist, c.title].filter(Boolean).join(' — ')}
                  </span>
                ) : null}
                <span style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
                  {[countryEs(c.country), c.year, c.labels[0]].filter(Boolean).join(' · ') ||
                    c.title}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-700)' }}>
                  {[c.catalogNumber ? `Cat. ${c.catalogNumber}` : null, c.formats.join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {note ? (
                  <span
                    style={{
                      display: 'block',
                      fontSize: 12,
                      marginTop: 2,
                      ...(note.strong ? { color: 'var(--color-accent-700)', fontWeight: 600 } : {}),
                    }}
                  >
                    {note.text}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          padding: '14px 20px',
          fontSize: 13,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {chosen?.masterId && source?.kind !== 'versions' ? (
          <button
            type="button"
            className="link"
            style={{ textAlign: 'left', fontSize: 13 }}
            onClick={() => onVersions(chosen)}
          >
            Ver todas las ediciones de este álbum →
          </button>
        ) : null}
        <Link href={manualHref}>No es ninguna — cargar manualmente</Link>
        {cands.length ? (
          <span className="muted" style={{ fontSize: 11 }}>
            Datos provistos por Discogs
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1 }} />
      <div className={s.foot}>
        {toWishlist ? (
          <button
            type="button"
            className="btn btn-primary cta"
            disabled={!chosen || adding}
            onClick={addToWishlist}
          >
            <span>Agregar a wishlist</span>
            <span>→</span>
          </button>
        ) : (
          <button type="button" className="btn btn-primary cta" disabled={!chosen} onClick={onNext}>
            <span>Usar esta edición</span>
            <span>→</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 03 Compra ───

function PurchaseStep({
  cand,
  wishlistId,
}: {
  cand: ExternalCandidate;
  wishlistId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [values, setValues] = useState<CopyValues>(() => emptyCopy(profile?.baseCurrency ?? 'USD'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per edition chosen: retries after a bad connection never duplicate the record.
  const idem = useMemo(() => crypto.randomUUID(), []);
  const { data: preview } = useQuery({
    queryKey: ['externalRelease', cand.externalId],
    queryFn: () => api.catalog.externalRelease(cand.externalId),
    staleTime: Infinity,
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const fields = { discogsReleaseId: Number(cand.externalId), ...copyToFields(values) };
      const res = wishlistId
        ? await api.wishlist.purchase(wishlistId, fields)
        : await api.collection.add(fields, idem);
      await invalidate();
      toast.show(`Agregaste ${cand.title} a tu colección.`);
      toast.celebrate(res.unlockedAchievements);
      router.replace(`/coleccion/${res.item.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const tracks = preview?.tracklist.length;
  return (
    <div className={s.body}>
      <div className={s.summary}>
        <Cover url={preview?.images[0]?.url ?? cand.coverUrl ?? cand.thumbUrl} size={72} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{cand.title}</div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
            {[countryEs(cand.country), cand.year, cand.labels[0], cand.catalogNumber]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div
            style={{
              fontSize: 11,
              marginTop: 4,
              color: 'var(--color-accent-700)',
              fontWeight: 600,
            }}
          >
            Datos importados de Discogs{tracks ? ` · ${tracks} temas` : ''}
          </div>
        </div>
      </div>
      <div className={s.form}>
        <CopyForm value={values} onChange={setValues} />
        {preview?.lowestPrice ? (
          <div className={s.hint}>
            Valor de referencia de esta edición:{' '}
            <b>desde {money(preview.lowestPrice.amount, preview.lowestPrice.currency)}</b> · Discogs
            Marketplace.
          </div>
        ) : null}
        {error ? <div className={s.error}>{error}</div> : null}
      </div>
      <div style={{ flex: 1 }} />
      <div className={s.foot}>
        <button type="button" className="btn btn-primary cta" disabled={busy} onClick={save}>
          <span>{busy ? 'Guardando…' : 'Guardar en colección'}</span>
          <span>✓</span>
        </button>
      </div>
    </div>
  );
}
