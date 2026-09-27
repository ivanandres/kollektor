'use client';

import Link from 'next/link';
import { Avatar } from '@/components/Avatar';
import { Cover } from '@/components/Cover';
import { SearchIcon } from '@/components/icons';
import { useToast } from '@/components/Toasts';
import { errorMessage } from '@/lib/api';
import { badgeMark, num, signed } from '@/lib/format';
import {
  badgeRow,
  essentialDetail,
  essentialHeadline,
  insightHref,
  pickEssential,
} from '@/lib/gamification';
import {
  useAchievements,
  useAddMissingToWishlist,
  useCollectionPage,
  useDashboard,
  useDiscover,
  useEssentials,
  useWishlist,
} from '@/lib/queries';
import { EmptyCollection } from './EmptyCollection';
import s from './dashboard.module.css';

/** 1c — Dashboard B: progreso y descubrimiento (mobile). */
export function DashboardProgress() {
  const { data: dash } = useDashboard();
  const { data: recent } = useCollectionPage({ sort: 'added_desc', pageSize: 8 });
  const { data: achievements } = useAchievements();
  const { data: essentials } = useEssentials();
  const { data: insights } = useDiscover();
  const { data: wishlist } = useWishlist();
  const addMissing = useAddMissingToWishlist();
  const toast = useToast();

  const sum = dash?.summary;
  const hero = pickEssential(essentials);
  const firstMissing = hero?.missing[0];
  const wished =
    firstMissing &&
    wishlist?.some((w) => w.album.id === firstMissing.albumId && w.status !== 'purchased');
  const unlocked = achievements?.filter((a) => a.unlocked).length ?? 0;
  const forYou = (insights ?? [])
    .filter((i) => !('listCode' in i && hero && i.listCode === hero.code))
    .slice(0, 3);

  return (
    <div>
      <div className={s.top}>
        <div className={s.brand}>Kolektorz</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/buscar" className={s.iconBox} aria-label="Buscar">
            <SearchIcon />
          </Link>
          <Avatar />
        </div>
      </div>

      {sum && sum.items === 0 ? (
        <EmptyCollection />
      ) : (
        <>
          {hero ? (
            <section className={s.hero}>
              <div className={s.heroKicker}>Discografía esencial</div>
              <div className={s.heroTitle}>{essentialHeadline(hero)}</div>
              <div className={s.dots} style={{ gridTemplateColumns: `repeat(${hero.total}, 1fr)` }}>
                {Array.from({ length: hero.total }, (_, i) => (
                  <div
                    key={i}
                    style={{ background: i < hero.owned ? 'var(--color-bg)' : 'transparent' }}
                  />
                ))}
              </div>
              <div className={s.heroFoot}>
                <span>{essentialDetail(hero)}</span>
                {firstMissing ? (
                  wished ? (
                    <Link href="/wishlist">En tu wishlist ✓</Link>
                  ) : (
                    <button
                      type="button"
                      disabled={addMissing.isPending}
                      onClick={() =>
                        addMissing.mutate(firstMissing.albumId, {
                          onSuccess: () =>
                            toast.show(`Sumaste ${firstMissing.title} a tu wishlist.`),
                          onError: (e) => toast.show(errorMessage(e), 'error'),
                        })
                      }
                    >
                      Agregar a wishlist →
                    </button>
                  )
                ) : null}
              </div>
            </section>
          ) : null}

          <div className={s.three}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap' }}>
                {num(sum?.items)}
              </div>
              <div className={s.small}>{sum?.items === 1 ? 'vinilo' : 'vinilos'}</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>
                {num(sum?.estimated)}
              </div>
              <div className={s.small}>{sum?.currency ?? 'USD'} estimado</div>
            </div>
            <div>
              <div
                className={sum && sum.difference < 0 ? 'neg' : 'pos'}
                style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}
              >
                {signed(sum?.difference)}
              </div>
              <div className={s.small}>vs. invertido</div>
            </div>
          </div>

          <section className={s.recent}>
            <div className={s.sectionHead} style={{ paddingRight: 20, marginBottom: 10 }}>
              <span className="kicker">Últimos agregados</span>
              <Link
                href="/coleccion"
                style={{ fontSize: 12, color: 'var(--color-accent-700)', textDecoration: 'none' }}
              >
                Ver todos
              </Link>
            </div>
            <div className={s.recentRow}>
              {recent?.items.map((a) => (
                <Link key={a.id} href={`/coleccion/${a.id}`} className={`plain ${s.recentItem}`}>
                  <Cover url={a.coverImageUrl} size={128} label="portada" />
                  <div className={s.recentTitle}>{a.title}</div>
                  <div className={s.small}>{a.artist}</div>
                </Link>
              ))}
            </div>
          </section>

          <section className={`${s.pad} ${s.rule}`}>
            <Link href="/logros" className={`plain ${s.sectionHead}`} style={{ marginBottom: 12 }}>
              <span className="kicker">Logros</span>
              <span className={s.small}>
                {unlocked} de {achievements?.length ?? 0}
              </span>
            </Link>
            <div className={s.badges}>
              {badgeRow(achievements).map((b) => (
                <Link
                  key={b.code}
                  href="/logros"
                  className={`plain ${s.badge}`}
                  title={b.description}
                >
                  <div
                    className={s.badgeMark}
                    style={
                      b.unlocked
                        ? { background: 'var(--color-text)', color: 'var(--color-bg)' }
                        : {
                            color: 'var(--color-neutral-500)',
                            border: '1.5px dashed var(--color-neutral-400)',
                          }
                    }
                  >
                    {badgeMark(b.name)}
                  </div>
                  <div
                    className={s.badgeName}
                    style={{ color: b.unlocked ? 'var(--color-text)' : 'var(--color-neutral-600)' }}
                  >
                    {b.name}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {forYou.length ? (
            <section style={{ padding: '16px 20px 24px' }}>
              <div className="kicker" style={{ marginBottom: 6 }}>
                Para vos
              </div>
              {forYou.map((i) => (
                <Link key={i.message} href={insightHref(i)} className={s.insight}>
                  <span>{i.message}</span>
                  <span style={{ color: 'var(--color-accent)' }}>→</span>
                </Link>
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
