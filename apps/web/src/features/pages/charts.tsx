'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { money, num, pct, shortDate } from '@kollektor/app-logic';
import s from './pages.module.css';

interface Row {
  key: string;
  label: string;
  count: number;
}

/** Horizontal bars (1b "Por década"): the largest in accent, the rest in ink. */
export function HBars({
  rows,
  labelWidth = 96,
  href,
  limit = 8,
}: {
  rows: Row[];
  labelWidth?: number;
  href?: (r: Row) => string;
  limit?: number;
}) {
  const shown = rows.slice(0, limit);
  const max = Math.max(1, ...shown.map((r) => r.count));
  if (!shown.length) return <div className={s.small}>Sin datos todavía.</div>;
  return (
    <div style={{ ['--label-w' as string]: `${labelWidth}px` }}>
      {shown.map((r) => {
        const body = (
          <>
            <span className="ellipsis">{r.label}</span>
            <div style={{ height: 10, background: 'var(--color-surface)' }}>
              <div
                style={{
                  height: 10,
                  width: pct(r.count, max),
                  background: r.count === max ? 'var(--color-accent)' : 'var(--color-text)',
                }}
              />
            </div>
            <span style={{ textAlign: 'right', fontWeight: 600 }}>{r.count}</span>
          </>
        );
        return href ? (
          <Link key={r.key} href={href(r)} className={s.hbar} title={`${r.label}: ${r.count}`}>
            {body}
          </Link>
        ) : (
          <div key={r.key} className={s.hbar} title={`${r.label}: ${r.count}`}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Vertical bars (1k "Por década") for a short series such as spend per year. */
export function VBars({
  rows,
  format = (n: number) => num(n),
  height = 150,
}: {
  rows: { key: string; label: string; value: number; title?: string }[];
  format?: (n: number) => string;
  height?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className={s.small}>Sin datos todavía.</div>;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height }}>
      {rows.map((r) => (
        <div
          key={r.key}
          title={r.title ?? `${r.label}: ${format(r.value)}`}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            height: '100%',
            gap: 4,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {format(r.value)}
          </span>
          <div
            style={{
              height: pct(r.value, max),
              background: r.value === max ? 'var(--color-accent)' : 'var(--color-text)',
              borderRadius: '2px 2px 0 0',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--color-neutral-700)' }}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

interface Point {
  date: string;
  invested: number;
  estimated: number;
}

/** Collection value over time: estimated (accent) vs invested (ink), one shared axis, hover crosshair. */
export function ValueChart({ points, currency }: { points: Point[]; currency: string }) {
  const W = 640;
  const H = 200;
  const pad = { l: 44, r: 12, t: 12, b: 24 };
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const { x, y, ticks, max } = useMemo(() => {
    const max = Math.max(1, ...points.flatMap((p) => [p.invested, p.estimated])) * 1.08;
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const unit = max / step > 5 ? step : step / 2;
    const ticks = Array.from({ length: Math.floor(max / unit) + 1 }, (_, i) => i * unit);
    const x = (i: number) =>
      pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
    const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    return { x, y, ticks, max };
  }, [points, pad.l, pad.r, pad.t, pad.b]);

  if (points.length < 2)
    return (
      <div className={s.small}>
        El historial de valor se arma con una foto por día. Volvé en unos días para ver la
        evolución.
      </div>
    );

  const path = (k: 'invested' | 'estimated') =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;
  const h = hover != null ? points[hover] : null;

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 8 }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 14, height: 2, background: 'var(--color-accent)' }} /> Estimado{' '}
          {money(last.estimated, currency)}
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 14, height: 2, background: 'var(--color-text)' }} /> Invertido{' '}
          {money(last.invested, currency)}
        </span>
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Valor estimado e invertido a lo largo del tiempo, en ${currency}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          style={{ display: 'block', touchAction: 'pan-y' }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-neutral-300)"
                strokeWidth={1}
              />
              <text
                x={pad.l - 6}
                y={y(t) + 3}
                textAnchor="end"
                fontSize={10}
                fill="var(--color-neutral-700)"
              >
                {num(t)}
              </text>
            </g>
          ))}
          <text x={pad.l} y={H - 6} fontSize={10} fill="var(--color-neutral-700)">
            {shortDate(points[0]!.date, true)}
          </text>
          <text
            x={W - pad.r}
            y={H - 6}
            fontSize={10}
            textAnchor="end"
            fill="var(--color-neutral-700)"
          >
            {shortDate(last.date, true)}
          </text>
          <path
            d={path('invested')}
            fill="none"
            stroke="var(--color-text)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <path
            d={path('estimated')}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
          />
          {hover != null && h ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={pad.t}
                y2={H - pad.b}
                stroke="var(--color-neutral-500)"
                strokeWidth={1}
              />
              <circle
                cx={x(hover)}
                cy={y(h.estimated)}
                r={4}
                fill="var(--color-accent)"
                stroke="var(--color-bg)"
                strokeWidth={2}
              />
              <circle
                cx={x(hover)}
                cy={y(h.invested)}
                r={4}
                fill="var(--color-text)"
                stroke="var(--color-bg)"
                strokeWidth={2}
              />
            </g>
          ) : null}
          <rect x={0} y={0} width={W} height={H} fill="transparent" />
        </svg>
        {h && hover != null ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})`,
              background: 'var(--color-bg)',
              boxShadow: 'var(--shadow-md)',
              padding: '6px 8px',
              fontSize: 12,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontWeight: 600 }}>{shortDate(h.date, true)}</div>
            <div>Estimado {money(h.estimated, currency)}</div>
            <div>Invertido {money(h.invested, currency)}</div>
          </div>
        ) : null}
      </div>
      <span className="visually-hidden">Máximo del eje: {num(max)}</span>
    </div>
  );
}
