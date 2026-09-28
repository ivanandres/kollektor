'use client';

import Link from 'next/link';
import { Cover } from '@/components/Cover';
import { dec1, num, pct, signed } from '@kollektor/app-logic';
import { nextCountAchievement } from '@kollektor/app-logic';
import { useAchievements, useCollectionPage, useDashboard, useEssentials } from '@/lib/queries';
import { EmptyCollection } from './EmptyCollection';
import s from './dashboard.module.css';

const GENRE_COLORS = [
  'var(--color-accent)',
  'var(--color-text)',
  'var(--color-neutral-600)',
  'var(--color-neutral-400)',
  'var(--color-neutral-300)',
];

/** 1k — Dashboard web, analítico. */
export function DashboardWeb() {
  const { data: d } = useDashboard();
  const { data: recent } = useCollectionPage({ sort: 'added_desc', pageSize: 6 });
  const { data: essentials } = useEssentials();
  const { data: achievements } = useAchievements();
  const sum = d?.summary;
  const cur = sum?.currency ?? 'USD';

  if (sum && sum.items === 0)
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 0' }}>
        <EmptyCollection />
      </div>
    );

  const decades = d?.charts.byDecade ?? [];
  const maxDecade = Math.max(1, ...decades.map((x) => x.count));
  const artists = (d?.charts.byArtist ?? []).slice(0, 6);
  const maxArtist = Math.max(1, ...artists.map((x) => x.count));
  const allGenres = d?.charts.byGenre ?? [];
  const genres = allGenres.slice(0, 4).map((g) => ({ label: g.label, n: g.count }));
  const rest = allGenres.slice(4).reduce((a, g) => a + g.count, 0);
  if (rest > 0) genres.push({ label: 'Otros', n: rest });
  const genreTotal = genres.reduce((a, g) => a + g.n, 0) || 1;
  const discos = [...(essentials ?? [])]
    .filter((e) => e.owned > 0)
    .sort((a, b) => b.owned / b.total - a.owned / a.total)
    .slice(0, 5);
  const next = nextCountAchievement(achievements);
  const diffPct = sum && sum.invested ? (sum.difference / sum.invested) * 100 : null;

  return (
    <div>
      <div className={s.kpis}>
        <div>
          <div className={s.kpiLabel}>Vinilos</div>
          <div className={s.kpiBig}>{num(sum?.items)}</div>
        </div>
        <div>
          <div className={s.kpiLabel}>Artistas</div>
          <div className={s.kpiNum}>{num(sum?.artists)}</div>
          <div className={s.small}>
            {num(sum?.albums)} álbumes · {num(sum?.releases)} ediciones
          </div>
        </div>
        <div>
          <div className={s.kpiLabel}>Invertido</div>
          <div className={s.kpiNum}>{num(sum?.invested)}</div>
          <div className={s.small}>
            {cur} · prom. {dec1(sum?.averagePaid)}
          </div>
        </div>
        <div>
          <div className={s.kpiLabel}>Valor estimado*</div>
          <div className={s.kpiNum}>{num(sum?.estimated)}</div>
          <div className={s.small}>
            {cur} · prom. {dec1(sum?.averageEstimated)}
          </div>
        </div>
        <div className={s.kpiAccent}>
          <div className={s.kpiLabel}>Diferencia</div>
          <div className={s.kpiNum}>{signed(sum?.difference)}</div>
          <div className={s.small}>
            {cur}
            {diffPct != null ? ` · ${diffPct >= 0 ? '+' : '−'}${dec1(Math.abs(diffPct))} %` : ''}
          </div>
        </div>
      </div>

      <div className={s.charts}>
        <div>
          <div className="kicker" style={{ marginBottom: 14 }}>
            Por década
          </div>
          <div className={s.vbars}>
            {decades.map((x) => (
              <Link key={x.key} href={`/coleccion?decade=${x.key}`} className={`plain ${s.vbar}`}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>{x.count}</span>
                <div
                  style={{
                    height: pct(x.count, maxDecade),
                    background: x.count === maxDecade ? 'var(--color-accent)' : 'var(--color-text)',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--color-neutral-700)' }}>
                  {x.label.slice(2)}
                </span>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <div className="kicker" style={{ marginBottom: 14 }}>
            Top artistas
          </div>
          {artists.map((x) => (
            <Link
              key={x.key}
              href={`/coleccion?artistId=${x.key}`}
              className={`plain ${s.artistBar}`}
            >
              <span className="ellipsis">{x.label}</span>
              <div style={{ height: 10, background: 'var(--color-surface)' }}>
                <div
                  style={{
                    height: 10,
                    width: pct(x.count, maxArtist),
                    background: 'var(--color-text)',
                  }}
                />
              </div>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>{x.count}</span>
            </Link>
          ))}
        </div>
        <div>
          <div className="kicker" style={{ marginBottom: 14 }}>
            Géneros
          </div>
          <div className={s.stack}>
            {genres.map((g, i) => (
              <div
                key={g.label}
                title={`${g.label} · ${g.n}`}
                style={{
                  width: `${((g.n / genreTotal) * 100).toFixed(1)}%`,
                  background: GENRE_COLORS[i],
                }}
              />
            ))}
          </div>
          {genres.map((g, i) => (
            <div key={g.label} className={s.legend}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, background: GENRE_COLORS[i] }} />
                {g.label}
              </span>
              <span style={{ fontWeight: 600 }}>{g.n}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={s.bottomRow}>
        <div>
          <div className={s.sectionHead} style={{ marginBottom: 14 }}>
            <span className="kicker">Últimos agregados</span>
            <Link
              href="/coleccion"
              style={{ fontSize: 12, color: 'var(--color-accent-700)', textDecoration: 'none' }}
            >
              Ver colección →
            </Link>
          </div>
          <div className={s.six}>
            {recent?.items.map((a) => (
              <Link key={a.id} href={`/coleccion/${a.id}`} className="plain">
                <Cover url={a.coverImageUrl} />
                <div className={s.recentTitle}>{a.title}</div>
                <div className={s.small}>{a.artist}</div>
              </Link>
            ))}
          </div>
          <div className={s.small} style={{ fontSize: 11, marginTop: 18 }}>
            * Estimación basada en datos de mercado. No es una tasación.
          </div>
        </div>
        <div>
          <div className="kicker" style={{ marginBottom: 10 }}>
            Discografías
          </div>
          {discos.map((e) => {
            const ratio = e.owned / e.total;
            return (
              <Link key={e.code} href="/logros" className={s.disco}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <b>{e.artistName}</b>
                  <span>
                    {e.owned} / {e.total}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--color-surface)', marginTop: 6 }}>
                  <div
                    style={{
                      height: 6,
                      width: pct(e.owned, e.total),
                      background: ratio > 0.85 ? 'var(--color-accent)' : 'var(--color-text)',
                    }}
                  />
                </div>
              </Link>
            );
          })}
          {discos.length === 0 ? (
            <div className={s.small}>Todavía no empezaste ninguna discografía esencial.</div>
          ) : null}
          {next ? (
            <div className={s.nextBox}>
              <b>Próximo logro:</b> {next.name} — faltan{' '}
              {num(next.progress.target - next.progress.current)}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
