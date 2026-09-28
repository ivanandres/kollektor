'use client';

import type { Dashboard } from '@kollektor/api-client';
import { Avatar } from '@/components/Avatar';
import { money, num, pct, relativeDay, signedMoney } from '@kollektor/app-logic';
import { nextCountAchievement } from '@kollektor/app-logic';
import { useAchievements, useDashboard, useProfile } from '@/lib/queries';
import { EmptyCollection } from './EmptyCollection';
import s from './dashboard.module.css';

/** "Tu colección en números" rows. */
export function facts(d: Dashboard): { k: string; v: string }[] {
  const h = d.highlights;
  const cur = d.summary.currency;
  const out: { k: string; v: string }[] = [];
  if (h.topArtist)
    out.push({ k: 'Artista más representado', v: `${h.topArtist.label} · ${h.topArtist.count}` });
  if (h.topDecade)
    out.push({ k: 'Década predominante', v: `${h.topDecade.label} · ${h.topDecade.count}` });
  if (h.topGenre)
    out.push({
      k: 'Género predominante',
      v: `${h.topGenre.label} · ${pct(h.topGenre.count, d.summary.items)}`,
    });
  if (h.oldestEdition)
    out.push({
      k: 'Edición más antigua',
      v: `${h.oldestEdition.title} · ${h.oldestEdition.releaseYear ?? '—'}`,
    });
  if (h.mostValuable)
    out.push({
      k: 'Disco más valioso',
      v: `${h.mostValuable.title} · ${money(h.mostValuable.estimatedValue, cur)}`,
    });
  if (h.biggestPurchase && h.biggestPurchase.collectionItemId !== h.mostValuable?.collectionItemId)
    out.push({
      k: 'Compra más cara',
      v: `${h.biggestPurchase.title} · ${money(h.biggestPurchase.paid, cur)}`,
    });
  if (h.latestAddition)
    out.push({
      k: 'Última incorporación',
      v: `${h.latestAddition.title} · ${relativeDay(h.latestAddition.addedAt)}`,
    });
  return out;
}

/** 1b — Dashboard A: números primero (mobile). */
export function DashboardNumbers() {
  const { data: d } = useDashboard();
  const { data: profile } = useProfile();
  const { data: achievements } = useAchievements();
  const sum = d?.summary;
  const cur = sum?.currency ?? 'USD';
  const decades = d?.charts.byDecade ?? [];
  const max = Math.max(1, ...decades.map((x) => x.count));
  const next = nextCountAchievement(achievements);
  const firstName = (profile?.displayName || profile?.username || '').split(' ')[0];

  return (
    <div>
      <div className={s.hello}>
        <div>
          <div className={s.small}>{firstName ? `Hola, ${firstName}` : 'Hola'}</div>
          <div
            style={{ fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: '-.02em' }}
          >
            Tu colección
          </div>
        </div>
        <Avatar />
      </div>
      {sum && sum.items === 0 ? (
        <EmptyCollection />
      ) : (
        <>
          <div className={s.rule} style={{ padding: '20px 20px 16px' }}>
            <div className={s.big}>{num(sum?.items)}</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>
              {sum?.items === 1 ? 'vinilo' : 'vinilos'}
            </div>
          </div>
          <div className={s.three}>
            {(
              [
                [sum?.artists, 'artistas'],
                [sum?.albums, 'álbumes'],
                [sum?.releases, 'ediciones'],
              ] as const
            ).map(([n, l]) => (
              <div key={l}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{num(n)}</div>
                <div className={s.small}>{l}</div>
              </div>
            ))}
          </div>
          <div className={s.two}>
            <div>
              <div className={s.small}>Invertido</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{money(sum?.invested, cur)}</div>
            </div>
            <div>
              <div className={s.small}>Valor estimado*</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{money(sum?.estimated, cur)}</div>
            </div>
            <div className={s.diffRow}>
              <span style={{ fontSize: 13 }}>Diferencia</span>
              <span
                className={sum && sum.difference < 0 ? 'neg' : 'pos'}
                style={{ fontSize: 18, fontWeight: 800 }}
              >
                {signedMoney(sum?.difference, cur)}
              </span>
            </div>
          </div>
          <section className={`${s.pad} ${s.rule}`}>
            <div className="kicker" style={{ marginBottom: 12 }}>
              Por década
            </div>
            <div className={s.hbars}>
              {decades.map((x) => (
                <div key={x.key} className={s.hbar}>
                  <span>{x.label}</span>
                  <div style={{ height: 10, background: 'var(--color-surface)' }}>
                    <div
                      style={{
                        height: 10,
                        width: pct(x.count, max),
                        background: x.count === max ? 'var(--color-accent)' : 'var(--color-text)',
                      }}
                    />
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{x.count}</span>
                </div>
              ))}
            </div>
          </section>
          {next ? (
            <section className={`${s.pad} ${s.rule}`}>
              <div className={s.sectionHead} style={{ marginBottom: 8 }}>
                <span className="kicker">Próximo logro</span>
                <span className={s.small}>
                  faltan {num(next.progress.target - next.progress.current)}
                </span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{next.name}</div>
              <div style={{ height: 8, background: 'var(--color-surface)', marginTop: 8 }}>
                <div
                  style={{
                    height: 8,
                    width: pct(next.progress.current, next.progress.target),
                    background: 'var(--color-accent)',
                  }}
                />
              </div>
            </section>
          ) : null}
          <section style={{ padding: '16px 20px 24px' }}>
            <div className="kicker" style={{ marginBottom: 8 }}>
              Tu colección en números
            </div>
            {d
              ? facts(d).map((f) => (
                  <div key={f.k} className={s.fact}>
                    <span className="muted">{f.k}</span>
                    <span style={{ fontWeight: 600, textAlign: 'right' }}>{f.v}</span>
                  </div>
                ))
              : null}
            <div className={s.small} style={{ fontSize: 11, marginTop: 10 }}>
              * Estimación basada en datos de mercado. No es una tasación.
            </div>
          </section>
        </>
      )}
    </div>
  );
}
