'use client';

import type { AddToCollectionInput, ManualReleaseInput } from '@kollektor/schemas';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CURRENCIES, parseAmount } from '@/components/CopyForm';
import { useToast } from '@/components/Toasts';
import s from '@/features/flow/flow.module.css';
import { api, ApiError, errorMessage } from '@/lib/api';
import { CONDITIONS } from '@/lib/format';
import { useInvalidateAll, useProfile } from '@/lib/queries';

type Values = Record<FieldKey, string>;
type FieldKey =
  | 'artist'
  | 'title'
  | 'year'
  | 'genre'
  | 'style'
  | 'tracklist'
  | 'editionYear'
  | 'country'
  | 'label'
  | 'catalog'
  | 'format'
  | 'editionType'
  | 'condMedia'
  | 'condSleeve'
  | 'barcode'
  | 'date'
  | 'price'
  | 'currency'
  | 'place'
  | 'notes'
  | 'location'
  | 'tags';

interface Field {
  key: FieldKey;
  label: string;
  ph: string;
  full?: boolean;
  kind?: 'text' | 'textarea' | 'select' | 'date' | 'number';
  options?: [string, string][];
}

const EDITION_OPTIONS: [string, string][] = [
  ['', '—'],
  ['original', '1ª edición'],
  ['reissue', 'Reedición'],
  ['remaster', 'Remaster'],
  ['limited', 'Edición limitada'],
  ['promo', 'Promo'],
  ['bootleg', 'Bootleg'],
  ['compilation', 'Compilado'],
  ['other', 'Otra'],
];
const COND_OPTIONS: [string, string][] = [
  ['', '—'],
  ...CONDITIONS.map((c): [string, string] => [c, c]),
];
const FORMAT_OPTIONS: [string, string][] = [
  'LP',
  '2×LP',
  '3×LP',
  'EP',
  '7"',
  '10"',
  '12"',
  'Box Set',
].map((f): [string, string] => [f, f]);

const SECTIONS: { n: string; title: string; sub: string; fields: Field[] }[] = [
  {
    n: '01',
    title: 'Álbum',
    sub: 'Artista, título, año, género, tracklist',
    fields: [
      { key: 'artist', label: 'Artista', ph: 'Pink Floyd', full: true },
      { key: 'title', label: 'Título', ph: 'Meddle', full: true },
      { key: 'year', label: 'Año original', ph: '1971', kind: 'number' },
      { key: 'genre', label: 'Género', ph: 'Rock' },
      { key: 'style', label: 'Estilo', ph: 'Prog Rock', full: true },
      {
        key: 'tracklist',
        label: 'Tracklist',
        ph: 'A1 One of These Days 5:57\nA2 A Pillow of Winds',
        full: true,
        kind: 'textarea',
      },
    ],
  },
  {
    n: '02',
    title: 'Edición',
    sub: 'País, sello, catálogo, formato, condición',
    fields: [
      { key: 'editionYear', label: 'Año de edición', ph: '1971', kind: 'number' },
      { key: 'country', label: 'País', ph: 'UK' },
      { key: 'label', label: 'Sello', ph: 'Harvest' },
      { key: 'catalog', label: 'Catálogo', ph: 'SHVL 795' },
      { key: 'format', label: 'Formato', ph: 'LP', kind: 'select', options: FORMAT_OPTIONS },
      {
        key: 'editionType',
        label: 'Tipo de edición',
        ph: '',
        kind: 'select',
        options: EDITION_OPTIONS,
      },
      { key: 'condMedia', label: 'Cond. disco', ph: '', kind: 'select', options: COND_OPTIONS },
      { key: 'condSleeve', label: 'Cond. portada', ph: '', kind: 'select', options: COND_OPTIONS },
    ],
  },
  {
    n: '03',
    title: 'Compra',
    sub: 'Fecha, precio, moneda, lugar',
    fields: [
      { key: 'date', label: 'Fecha', ph: '', kind: 'date' },
      { key: 'price', label: 'Precio pagado', ph: '45' },
      {
        key: 'currency',
        label: 'Moneda',
        ph: 'USD',
        kind: 'select',
        options: CURRENCIES.map((c): [string, string] => [c, c]),
      },
      { key: 'place', label: 'Lugar', ph: 'Disquería…' },
      { key: 'notes', label: 'Notas personales', ph: '', full: true },
    ],
  },
  {
    n: '04',
    title: 'Colección',
    sub: 'Ubicación física (privada) y tags',
    fields: [
      { key: 'location', label: 'Ubicación física', ph: 'Estante 3 · fila B', full: true },
      { key: 'tags', label: 'Tags', ph: 'prog, favoritos', full: true },
    ],
  },
];

const DRAFT_KEY = 'kz.draft.manual';

function blank(currency: string): Values {
  return {
    artist: '',
    title: '',
    year: '',
    genre: '',
    style: '',
    tracklist: '',
    editionYear: '',
    country: '',
    label: '',
    catalog: '',
    format: 'LP',
    editionType: '',
    condMedia: '',
    condSleeve: '',
    barcode: '',
    date: new Date().toISOString().slice(0, 10),
    price: '',
    currency,
    place: '',
    notes: '',
    location: '',
    tags: '',
  };
}

/** "A1 Title 3:45" per line → tracks. */
export function parseTracklist(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-Za-z]?\d{1,2}[a-z]?|[A-Z])[.)]?\s+(.+?)(?:\s+(\d{1,2}:\d{2}))?$/);
      if (m) return { position: m[1]!, title: m[2]!, duration: m[3] ?? null };
      const d = line.match(/^(.+?)\s+(\d{1,2}:\d{2})$/);
      return d
        ? { position: null, title: d[1]!, duration: d[2]! }
        : { position: null, title: line, duration: null };
    });
}

const int = (v: string) => (v.trim() && /^\d+$/.test(v.trim()) ? Number(v.trim()) : null);
const opt = (v: string) => (v.trim() ? v.trim() : null);

export function toInput(v: Values): AddToCollectionInput {
  const qtyMatch = v.format.match(/^(\d+)×(.+)$/);
  const price = parseAmount(v.price);
  return {
    manual: {
      album: {
        artists: v.artist.split(/\s*[;/]\s*/).filter(Boolean),
        title: v.title.trim(),
        originalReleaseYear: int(v.year),
        genres: v.genre.trim() ? [v.genre.trim()] : [],
        styles: v.style
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      },
      release: {
        year: int(v.editionYear) ?? int(v.year),
        country: opt(v.country),
        labels: v.label.trim() ? [{ name: v.label.trim(), catalogNumber: opt(v.catalog) }] : [],
        formats: [
          {
            name: 'Vinyl',
            qty: qtyMatch ? Number(qtyMatch[1]) : 1,
            descriptions: [qtyMatch ? qtyMatch[2]! : v.format].filter(Boolean),
          },
        ],
        editionType: opt(v.editionType) as ManualReleaseInput['release']['editionType'],
        barcode: opt(v.barcode),
      },
      tracks: parseTracklist(v.tracklist),
    },
    conditionMedia: (opt(v.condMedia) as AddToCollectionInput['conditionMedia']) ?? null,
    conditionSleeve: (opt(v.condSleeve) as AddToCollectionInput['conditionSleeve']) ?? null,
    purchaseDate: opt(v.date),
    purchasePrice: price,
    purchaseCurrency: price != null ? v.currency : null,
    purchasePlace: opt(v.place),
    notes: opt(v.notes),
    storageLocation: opt(v.location),
    tags: v.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  } as AddToCollectionInput;
}

function ago(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

/** 1h — Agregar manualmente: secciones plegables, borrador guardado en el dispositivo. */
export function ManualForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [values, setValues] = useState<Values>(() => blank('USD'));
  const [open, setOpen] = useState<Record<string, boolean>>({ '01': true });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idem = useRef<string>('');
  const loaded = useRef(false);

  // Restore a draft (or prefill from the photo/barcode step), once.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    let draft: { values: Values; savedAt: number; idem: string } | null;
    try {
      draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
    } catch {
      draft = null;
    }
    const prefill = {
      artist: params.get('artista') ?? '',
      title: params.get('titulo') ?? '',
      barcode: params.get('barcode') ?? '',
    };
    if (draft && !prefill.artist && !prefill.title && !prefill.barcode) {
      setValues(draft.values);
      setSavedAt(draft.savedAt);
      idem.current = draft.idem;
      setRestored(true);
    } else {
      setValues((v) => ({
        ...v,
        ...Object.fromEntries(Object.entries(prefill).filter(([, x]) => x)),
      }));
    }
    if (!idem.current) idem.current = crypto.randomUUID();
  }, [params]);

  useEffect(() => {
    if (profile?.baseCurrency)
      setValues((v) => (v.price ? v : { ...v, currency: profile.baseCurrency }));
  }, [profile?.baseCurrency]);

  // Persist the draft on every change (debounced) so a lost connection or closed tab loses nothing.
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      const empty = !values.artist && !values.title && !values.tracklist;
      try {
        if (empty) localStorage.removeItem(DRAFT_KEY);
        else {
          const at = Date.now();
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ values, savedAt: at, idem: idem.current }),
          );
          setSavedAt(at);
        }
      } catch {
        // storage full or unavailable
      }
    }, 500);
    return () => clearTimeout(t);
  }, [values]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      clearInterval(tick);
    };
  }, []);

  const set = (k: FieldKey, v: string) => setValues((x) => ({ ...x, [k]: v }));
  const valid = values.artist.trim() && values.title.trim();
  const trackCount = useMemo(() => parseTracklist(values.tracklist).length, [values.tracklist]);

  function discard() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    setValues(blank(profile?.baseCurrency ?? 'USD'));
    setRestored(false);
    setSavedAt(null);
    idem.current = crypto.randomUUID();
  }

  async function save() {
    if (!valid) {
      setOpen((o) => ({ ...o, '01': true }));
      setError('Completá al menos artista y título.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.collection.add(toInput(values), idem.current);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      await invalidate();
      toast.show(`Agregaste ${values.title} a tu colección.`);
      toast.celebrate(res.unlockedAchievements);
      router.replace(`/coleccion/${res.item.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NETWORK'
          ? 'Sin conexión. El borrador queda guardado en el teléfono; guardalo cuando vuelvas a tener señal.'
          : errorMessage(e),
      );
      setBusy(false);
    }
  }

  return (
    <div className={s.screen}>
      <div className={s.bar}>
        <button
          type="button"
          className={s.barBtn}
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
        >
          Cancelar
        </button>
        <span className={s.barTitle}>Nuevo vinilo</span>
        <Link href="/agregar" className={s.barSide}>
          Cámara
        </Link>
      </div>
      {!online ? (
        <div className={s.banner} role="status">
          <span>Sin conexión · borrador guardado en el teléfono</span>
          {savedAt ? <span>{ago(now - savedAt)}</span> : null}
        </div>
      ) : restored ? (
        <div className={s.banner} role="status">
          <span>Borrador recuperado{savedAt ? ` · ${ago(now - savedAt)}` : ''}</span>
          <button
            type="button"
            className="link"
            style={{ fontSize: 12, color: 'inherit' }}
            onClick={discard}
          >
            Descartar
          </button>
        </div>
      ) : null}
      <div className={s.body} style={{ borderTop: '2px solid var(--color-divider)' }}>
        {SECTIONS.map((sec) => {
          const isOpen = !!open[sec.n];
          return (
            <div key={sec.n} className={s.section}>
              <button
                type="button"
                className={`row-btn ${s.sectionHead}`}
                style={{ display: 'grid' }}
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [sec.n]: !o[sec.n] }))}
              >
                <span className={s.sectionNum}>{sec.n}</span>
                <span>
                  <span style={{ display: 'block', fontSize: 17, fontWeight: 800 }}>
                    {sec.title}
                  </span>
                  <span
                    style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-700)' }}
                  >
                    {sec.n === '01' && trackCount ? `${sec.sub} · ${trackCount} temas` : sec.sub}
                  </span>
                </span>
                <span style={{ fontSize: 20, fontWeight: 600 }}>{isOpen ? '−' : '+'}</span>
              </button>
              {isOpen ? (
                <div className={s.fields}>
                  {sec.fields.map((f) => (
                    <div key={f.key} className={`field ${f.full ? s.full : ''}`}>
                      <label htmlFor={`m-${f.key}`}>{f.label}</label>
                      {f.kind === 'select' ? (
                        <select
                          id={`m-${f.key}`}
                          className="input"
                          value={values[f.key]}
                          onChange={(e) => set(f.key, e.target.value)}
                        >
                          {f.options!.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : f.kind === 'textarea' ? (
                        <textarea
                          id={`m-${f.key}`}
                          className="input"
                          rows={4}
                          placeholder={f.ph}
                          value={values[f.key]}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      ) : (
                        <input
                          id={`m-${f.key}`}
                          className="input"
                          type={f.kind === 'date' ? 'date' : 'text'}
                          inputMode={
                            f.kind === 'number' || f.key === 'price' ? 'decimal' : undefined
                          }
                          placeholder={f.ph}
                          value={values[f.key]}
                          onChange={(e) => set(f.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
      </div>
      <div className={`${s.foot} ${s.footRule}`}>
        {error ? (
          <div className={s.error} style={{ marginBottom: 10 }} role="alert">
            {error}
          </div>
        ) : null}
        <button type="button" className="btn btn-primary cta" disabled={busy} onClick={save}>
          <span>{busy ? 'Guardando…' : 'Guardar en colección'}</span>
          <span>✓</span>
        </button>
      </div>
    </div>
  );
}
