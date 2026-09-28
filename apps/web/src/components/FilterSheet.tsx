'use client';

import { useEffect, useRef, useState } from 'react';
import { NumberInput } from './NumberInput';
import { chipGroups, clearFilters, isOn, SORT_LABEL, toggleValue, type Sort } from '@/lib/filters';
import { num } from '@/lib/format';
import { useFacets, type CollectionFilters } from '@/lib/queries';

interface Props {
  value: CollectionFilters;
  onChange: (f: CollectionFilters) => void;
  /** How many records match `value` (undefined while loading). */
  count: number | undefined;
  currency: string;
  onClose: () => void;
  /** Main button action; defaults to closing. */
  onSubmit?: () => void;
}

const MAX_CHIPS = 8;

/** Mobile "Filtros" bottom sheet (1f), shared by Colección and Buscar. */
export function FilterSheet({ value, onChange, count, currency, onClose, onSubmit }: Props) {
  const { data: facets } = useFacets();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const latest = useRef(value);
  latest.current = value;
  const numInput = (key: 'paidMin' | 'paidMax', label: string, ph: string) => (
    <div className="field">
      <label htmlFor={key}>{label}</label>
      <NumberInput
        id={key}
        className="input"
        style={{ minHeight: 44 }}
        placeholder={ph}
        value={value[key]}
        onCommit={(v) => onChange({ ...latest.current, [key]: v })}
      />
    </div>
  );

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Filtros">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>Filtros</div>
          <button
            type="button"
            className="link"
            style={{ fontSize: 13 }}
            onClick={() => onChange(clearFilters(value))}
          >
            Limpiar todo
          </button>
        </div>
        {chipGroups(facets).map((g) => {
          const all = g.options;
          const shown = expanded[g.key] ? all : all.slice(0, MAX_CHIPS);
          if (all.length === 0) return null;
          return (
            <div key={g.key}>
              <div className="kicker" style={{ marginBottom: 6 }}>
                {g.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {shown.map((o) => {
                  const on = isOn(value, g.key, o.value);
                  return (
                    <button
                      key={String(o.value)}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onChange(toggleValue(value, g.key, o.value))}
                      className="chip"
                      style={{
                        padding: '8px 12px',
                        fontSize: 13,
                        ...(on
                          ? { background: 'var(--color-accent)', color: 'var(--color-bg)' }
                          : {}),
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
                {all.length > MAX_CHIPS && !expanded[g.key] ? (
                  <button
                    type="button"
                    className="chip"
                    style={{ padding: '8px 12px', fontSize: 13, borderStyle: 'dashed' }}
                    onClick={() => setExpanded((x) => ({ ...x, [g.key]: true }))}
                  >
                    +{all.length - MAX_CHIPS}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        <div>
          <div className="kicker" style={{ marginBottom: 6 }}>
            Orden
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(SORT_LABEL) as Sort[]).map((k) => {
              const on = (value.sort ?? 'added_desc') === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  className="chip"
                  data-on={on}
                  style={{ padding: '8px 12px', fontSize: 13 }}
                  onClick={() => onChange({ ...value, sort: k })}
                >
                  {SORT_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {numInput('paidMin', 'Pagado desde', `${currency} 0`)}
          {numInput(
            'paidMax',
            'hasta',
            `${currency} ${facets?.ranges.paid.max ? num(facets.ranges.paid.max) : 200}`,
          )}
        </div>
        <button type="button" className="btn btn-primary cta" onClick={onSubmit ?? onClose}>
          <span>
            Ver {count == null ? '…' : num(count)} {count === 1 ? 'vinilo' : 'vinilos'}
          </span>
          <span>→</span>
        </button>
      </div>
    </>
  );
}
