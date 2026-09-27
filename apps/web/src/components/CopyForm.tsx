'use client';

import type { CollectionItemFields } from '@kollektor/schemas';
import type { InputHTMLAttributes } from 'react';
import { CONDITIONS } from '@/lib/format';

export type CopyValues = {
  conditionMedia: string | null;
  conditionSleeve: string | null;
  purchasePrice: string;
  purchaseCurrency: string;
  purchaseDate: string;
  purchasePlace: string;
  notes: string;
  storageLocation: string;
  tags: string;
  copyNumber: string;
};

export const CURRENCIES = ['USD', 'ARS', 'EUR', 'GBP', 'BRL', 'CLP', 'UYU', 'MXN', 'JPY'];

export function emptyCopy(currency: string): CopyValues {
  return {
    conditionMedia: null,
    conditionSleeve: null,
    purchasePrice: '',
    purchaseCurrency: currency,
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchasePlace: '',
    notes: '',
    storageLocation: '',
    tags: '',
    copyNumber: '',
  };
}

/** "35.000,50" / "35000.5" / "35" → number. A dot followed by exactly 3 digits is a thousands separator. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  let n: string;
  if (t.includes(',')) n = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '');
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const text = (v: string) => (v.trim() ? v.trim() : null);

/** Form values → API fields. Empty strings clear the field. */
export function copyToFields(v: CopyValues): CollectionItemFields {
  const price = parseAmount(v.purchasePrice);
  return {
    conditionMedia: (v.conditionMedia as CollectionItemFields['conditionMedia']) ?? null,
    conditionSleeve: (v.conditionSleeve as CollectionItemFields['conditionSleeve']) ?? null,
    purchasePrice: price,
    purchaseCurrency: price != null ? v.purchaseCurrency : null,
    purchaseDate: text(v.purchaseDate),
    purchasePlace: text(v.purchasePlace),
    notes: text(v.notes),
    storageLocation: text(v.storageLocation),
    copyNumber: text(v.copyNumber),
    tags: v.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

/** Condition picker: 6 equal cells, the chosen one in accent (1g paso Compra). */
export function Segmented({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--color-neutral-700)' }}>
        {label}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${CONDITIONS.length}, 1fr)`,
          border: '1px solid var(--color-divider)',
        }}
      >
        {CONDITIONS.map((c, i) => {
          const on = value === c;
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(on ? null : c)}
              style={{
                cursor: 'pointer',
                padding: '12px 0',
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 600,
                border: 0,
                borderLeft: i ? '1px solid var(--color-divider)' : 0,
                background: on ? 'var(--color-accent)' : 'transparent',
                color: on ? 'var(--color-bg)' : 'var(--color-text)',
                font: 'inherit',
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Condición, compra y notas de la copia. `extended` adds ubicación, tags y número de copia (edit). */
export function CopyForm({
  value,
  onChange,
  extended = false,
}: {
  value: CopyValues;
  onChange: (v: CopyValues) => void;
  extended?: boolean;
}) {
  const set =
    <K extends keyof CopyValues>(k: K) =>
    (v: CopyValues[K]) =>
      onChange({ ...value, [k]: v });
  const input = (
    k: keyof CopyValues,
    label: string,
    props: InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="field">
      <label htmlFor={`cf-${k}`}>{label}</label>
      <input
        id={`cf-${k}`}
        className="input"
        style={{ minHeight: 48 }}
        value={value[k] ?? ''}
        onChange={(e) => onChange({ ...value, [k]: e.target.value })}
        {...props}
      />
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Segmented
        label="Condición del disco"
        value={value.conditionMedia}
        onChange={set('conditionMedia')}
      />
      <Segmented
        label="Condición de la portada"
        value={value.conditionSleeve}
        onChange={set('conditionSleeve')}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
        <div className="field">
          <label htmlFor="cf-price">Precio pagado</label>
          <input
            id="cf-price"
            className="input"
            style={{ minHeight: 48, fontSize: 18, fontWeight: 700 }}
            inputMode="decimal"
            placeholder="0"
            value={value.purchasePrice}
            onChange={(e) =>
              onChange({ ...value, purchasePrice: e.target.value.replace(/[^\d.,]/g, '') })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="cf-cur">Moneda</label>
          <select
            id="cf-cur"
            className="input"
            style={{ minHeight: 48 }}
            value={value.purchaseCurrency}
            onChange={(e) => onChange({ ...value, purchaseCurrency: e.target.value })}
          >
            {[...new Set([value.purchaseCurrency, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {input('purchaseDate', 'Fecha', { type: 'date' })}
        {input('purchasePlace', 'Dónde', { placeholder: 'Disquería…' })}
      </div>
      {input('notes', 'Notas', { placeholder: 'Incluye posters y stickers' })}
      {extended ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {input('storageLocation', 'Ubicación física (privada)', {
              placeholder: 'Estante 3 · fila B',
            })}
            {input('copyNumber', 'Nº de copia', { placeholder: '245/500' })}
          </div>
          {input('tags', 'Tags', { placeholder: 'prog, favoritos' })}
        </>
      ) : null}
    </div>
  );
}
