'use client';

import Link from 'next/link';
import { countryEs } from '@/lib/filters';
import { dec1, editionLong, money, num, signed } from '@/lib/format';
import { useStats } from '@/lib/queries';
import { HBars, ValueChart, VBars } from '@/features/pages/charts';
import s from '@/features/pages/pages.module.css';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (m: string) => {
  const [y, mm] = m.split('-');
  return `${MONTHS[Number(mm) - 1]} ${y}`;
};

/** Estadísticas (no mockup): resumen, distribuciones, dónde está el valor, evolución, repetidos. */
export default function StatsPage() {
  const { summary, breakdowns, value, timeline, duplicates } = useStats();
  const sum = summary.data;
  const b = breakdowns.data;
  const t = timeline.data;
  const cur = sum?.currency ?? 'USD';

  return (
    <div>
      <div className={s.head}>
        <h1 className={s.title}>Estadísticas</h1>
        <span className={s.sub}>{sum ? `${num(sum.items)} vinilos` : ''}</span>
      </div>

      <div className={s.kpis}>
        {(
          [
            ['Vinilos', num(sum?.items), null],
            ['Invertido', num(sum?.invested), cur],
            ['Valor estimado*', num(sum?.estimated), cur],
            ['Diferencia', signed(sum?.difference), cur],
            ['Pagaste en promedio', dec1(sum?.averagePaid), cur],
            ['Vale en promedio*', dec1(sum?.averageEstimated), cur],
          ] as const
        ).map(([label, v, unit], i) => (
          <div key={label}>
            <div className={s.small}>{label}</div>
            <div
              className={`${s.kpiNum} ${i === 3 ? (sum && sum.difference < 0 ? 'neg' : 'pos') : ''}`}
            >
              {v}
            </div>
            {unit ? <div className={s.small}>{unit}</div> : null}
          </div>
        ))}
      </div>

      <div className={`${s.grid} ${s.grid2}`}>
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className="kicker">Evolución del valor</span>
            <span className={s.small}>{cur}</span>
          </div>
          {t ? <ValueChart points={t.valueHistory} currency={t.currency} /> : null}
        </section>
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className="kicker">Gasto por año</span>
            {t?.topSpendingMonth ? (
              <span className={s.small}>
                Mes récord: {monthLabel(t.topSpendingMonth.month)} ·{' '}
                {money(t.topSpendingMonth.total, t.currency)}
              </span>
            ) : null}
          </div>
          {t ? (
            <VBars
              rows={t.spendPerYear.map((y) => ({
                key: String(y.year),
                label: String(y.year),
                value: y.total,
                title: `${y.year}: ${money(y.total, t.currency)} en ${y.purchases} compras (prom. ${dec1(y.average)})`,
              }))}
            />
          ) : null}
        </section>
      </div>

      <div className={s.grid}>
        <section className={s.section}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Artistas
          </div>
          <HBars
            rows={b?.byArtist ?? []}
            labelWidth={110}
            href={(r) => `/coleccion?artistId=${r.key}`}
          />
        </section>
        <section className={s.section}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Géneros y estilos
          </div>
          <HBars
            rows={b?.byGenre ?? []}
            href={(r) => `/coleccion?genre=${encodeURIComponent(r.key)}`}
            limit={5}
          />
          <div style={{ height: 8 }} />
          <HBars rows={b?.byStyle ?? []} limit={6} />
        </section>
        <section className={s.section}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Décadas
          </div>
          <HBars
            rows={b?.byDecade ?? []}
            labelWidth={48}
            href={(r) => `/coleccion?decade=${r.key}`}
            limit={10}
          />
        </section>
        <section className={s.section}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Países
          </div>
          <HBars
            rows={(b?.byCountry ?? []).map((r) => ({ ...r, label: countryEs(r.label) }))}
            href={(r) => `/coleccion?country=${encodeURIComponent(r.key)}`}
          />
        </section>
        <section className={s.section}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Sellos
          </div>
          <HBars rows={b?.byLabel ?? []} labelWidth={110} />
        </section>
        <section className={s.section}>
          <div className="kicker" style={{ marginBottom: 12 }}>
            Condición y edición
          </div>
          <HBars
            rows={b?.byCondition ?? []}
            labelWidth={48}
            href={(r) => `/coleccion?condition=${encodeURIComponent(r.key)}`}
          />
          <div style={{ height: 8 }} />
          <HBars
            rows={(b?.byEditionType ?? []).map((r) => ({ ...r, label: editionLong(r.key) }))}
          />
        </section>
      </div>

      <div className={`${s.grid} ${s.grid2}`}>
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className="kicker">Dónde está el valor</span>
            <span className={s.small}>invertido → estimado</span>
          </div>
          {(value.data?.byArtist ?? []).slice(0, 10).map((r) => (
            <Link key={r.key} href={`/coleccion?artistId=${r.key}`} className={s.row}>
              <span>
                <b>{r.label}</b> <span className={s.small}>· {r.count}</span>
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {num(r.invested)} → <b>{num(r.estimated)}</b>{' '}
                <span
                  className={r.estimated - r.invested < 0 ? 'neg' : 'pos'}
                  style={{ fontWeight: 600 }}
                >
                  {signed(r.estimated - r.invested)}
                </span>
              </span>
            </Link>
          ))}
          <div className={s.small} style={{ fontSize: 11, marginTop: 10 }}>
            * Estimación basada en datos de mercado. No es una tasación.
          </div>
        </section>
        <section className={s.section}>
          <div className={s.sectionHead}>
            <span className="kicker">Repetidos</span>
            <span className={s.small}>{duplicates.data?.length ?? 0}</span>
          </div>
          {duplicates.data?.length ? (
            duplicates.data.map((d) => (
              <Link key={d.albumId} href={`/coleccion?albumId=${d.albumId}`} className={s.row}>
                <span>
                  <b>{d.title}</b> <span className={s.small}>· {d.artist}</span>
                </span>
                <span className={s.small} style={{ whiteSpace: 'nowrap' }}>
                  {d.copies} copias · {d.editions} {d.editions === 1 ? 'edición' : 'ediciones'}
                </span>
              </Link>
            ))
          ) : (
            <div className={s.small}>No tenés álbumes repetidos.</div>
          )}
        </section>
      </div>
    </div>
  );
}
