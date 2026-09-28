'use client';

import type { Achievement } from '@kollektor/api-client';
import { useToast } from '@/components/Toasts';
import { errorMessage } from '@/lib/api';
import { badgeMark, num, pct, shortDate } from '@/lib/format';
import { wishedMatcher } from '@/lib/gamification';
import {
  useAchievements,
  useAddMissingToWishlist,
  useEssentials,
  useWishlist,
} from '@/lib/queries';
import s from '@/features/pages/pages.module.css';

const CATEGORY: Record<string, string> = {
  coleccion: 'Colección',
  diversidad: 'Diversidad',
  tiempo: 'Épocas',
  artistas: 'Artistas',
  paises: 'Países',
  rareza: 'Rarezas',
  discografias: 'Discografías completas',
};

/** Logros (no mockup): discografías esenciales con lo que falta, y todos los logros con su progreso. */
export default function AchievementsPage() {
  const { data: achievements } = useAchievements();
  const { data: essentials } = useEssentials();
  const { data: wishlist } = useWishlist();
  const add = useAddMissingToWishlist();
  const toast = useToast();
  const unlocked = achievements?.filter((a) => a.unlocked).length ?? 0;
  const isWished = wishedMatcher(wishlist);
  const started = [...(essentials ?? [])].sort(
    (a, b) => Number(a.complete) - Number(b.complete) || b.owned / b.total - a.owned / a.total,
  );
  const groups = Object.entries(
    (achievements ?? []).reduce<Record<string, Achievement[]>>((acc, a) => {
      (acc[a.category] ??= []).push(a);
      return acc;
    }, {}),
  );

  return (
    <div>
      <div className={s.head}>
        <h1 className={s.title}>Logros</h1>
        <span className={s.sub}>
          {unlocked} de {achievements?.length ?? 0}
        </span>
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <span className="kicker">Discografías esenciales</span>
          <span className={s.small}>{started.filter((e) => e.complete).length} completas</span>
        </div>
        <div
          style={{
            display: 'grid',
            gap: 0,
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            columnGap: 32,
          }}
        >
          {started.map((e) => (
            <div
              key={e.code}
              style={{ padding: '10px 0 14px', borderBottom: '1px solid var(--color-divider)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <b>{e.artistName}</b>
                <span>
                  {e.owned} / {e.total}
                  {e.complete ? ' ✓' : ''}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gap: 3,
                  marginTop: 8,
                  gridTemplateColumns: `repeat(${e.total}, 1fr)`,
                }}
              >
                {Array.from({ length: e.total }, (_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 8,
                      background: i < e.owned ? 'var(--color-accent)' : 'var(--color-surface)',
                    }}
                  />
                ))}
              </div>
              {e.missing.length ? (
                <div style={{ marginTop: 8 }}>
                  {e.missing.map((m) => (
                    <div
                      key={m.albumId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 13,
                        padding: '4px 0',
                      }}
                    >
                      <span>
                        {m.title}
                        {m.year ? <span className={s.small}> · {m.year}</span> : null}
                      </span>
                      {isWished(m.albumId, m.title, e.artistName) ? (
                        <span className={s.small}>en wishlist</span>
                      ) : (
                        <button
                          type="button"
                          className="link"
                          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                          disabled={add.isPending}
                          onClick={() =>
                            add.mutate(m.albumId, {
                              onSuccess: () => toast.show(`Sumaste ${m.title} a tu wishlist.`),
                              onError: (err) => toast.show(errorMessage(err), 'error'),
                            })
                          }
                        >
                          + Wishlist
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {groups.map(([cat, list]) => (
        <section key={cat} className={s.section}>
          <div className={s.sectionHead}>
            <span className="kicker">{CATEGORY[cat] ?? cat}</span>
            <span className={s.small}>
              {list.filter((a) => a.unlocked).length} de {list.length}
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '14px 24px',
            }}
          >
            {list.map((a) => (
              <div
                key={a.code}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '56px 1fr',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 800,
                    ...(a.unlocked
                      ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                      : {
                          color: 'var(--color-neutral-500)',
                          border: '1.5px dashed var(--color-neutral-400)',
                        }),
                  }}
                >
                  {badgeMark(a.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: a.unlocked ? 'var(--color-text)' : 'var(--color-neutral-700)',
                    }}
                  >
                    {a.name}
                  </div>
                  <div className={s.small}>{a.description}</div>
                  {a.unlocked ? (
                    <div className={s.small} style={{ fontSize: 11 }}>
                      Desbloqueado el {shortDate(a.unlockedAt, true)}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--color-surface)' }}>
                        <div
                          style={{
                            height: 6,
                            width: pct(a.progress.current, a.progress.target),
                            background: 'var(--color-accent)',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>
                        {num(a.progress.current)}/{num(a.progress.target)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
