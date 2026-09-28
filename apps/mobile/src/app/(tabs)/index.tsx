import {
  badgeMark,
  badgeRow,
  essentialDetail,
  essentialHeadline,
  insightHref,
  money,
  nextCountAchievement,
  num,
  pct,
  pickEssential,
  relativeDay,
  signed,
  signedMoney,
  wishedMatcher,
} from '@kollektor/app-logic';
import type { Dashboard } from '@kollektor/api-client';
import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Cover } from '@/components/Cover';
import { Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { Cta, hair, rule } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useDashboardVariant } from '@/lib/prefs';
import {
  useAchievements,
  useAddMissingToWishlist,
  useCollectionPage,
  useDashboard,
  useDiscover,
  useEssentials,
  useInvalidateAll,
  useProfile,
  useWishlist,
} from '@/lib/queries';
import { c } from '@/lib/theme';

/** Inicio: 1c (default) or 1b, switchable in Perfil. */
export default function Home() {
  const [variant] = useDashboardVariant();
  return variant === 'numeros' ? <Numbers /> : <Progress />;
}

function Avatar({ size = 36 }: { size?: number }) {
  return (
    <Link href="/perfil" asChild>
      <Pressable
        accessibilityLabel="Perfil"
        style={{ width: size, height: size, backgroundColor: c.n300 }}
      />
    </Link>
  );
}

function Empty() {
  const router = useRouter();
  return (
    <View style={[{ padding: 20, gap: 12, borderTopWidth: 2, borderTopColor: c.divider }, rule]}>
      <T kicker color={c.accent}>
        Tu colección
      </T>
      <T size={34} weight={800} lh={34} ls={-1}>
        Todavía no hay discos. Empezá por el que tengas más cerca.
      </T>
      <T size={14} muted>
        Sacale una foto a la portada, escaneá el código de barras o cargalo a mano. Si ya usás
        Discogs, importá tu colección desde Perfil.
      </T>
      <Cta label="Agregar mi primer vinilo" onPress={() => router.push('/agregar')} />
    </View>
  );
}

function useRefresh() {
  const invalidate = useInvalidateAll();
  const d = useDashboard();
  return { refreshing: d.isRefetching, onRefresh: () => void invalidate() };
}

/** 1c — progreso y descubrimiento. */
function Progress() {
  const router = useRouter();
  const toast = useToast();
  const { data: dash } = useDashboard();
  const { data: recent } = useCollectionPage({ sort: 'added_desc', pageSize: 8 });
  const { data: achievements } = useAchievements();
  const { data: essentials } = useEssentials();
  const { data: insights } = useDiscover();
  const { data: wishlist } = useWishlist();
  const addMissing = useAddMissingToWishlist();
  const sum = dash?.summary;
  const hero = pickEssential(essentials);
  const first = hero?.missing[0];
  const wished =
    first && hero && wishedMatcher(wishlist)(first.albumId, first.title, hero.artistName);
  const unlocked = achievements?.filter((a) => a.unlocked).length ?? 0;
  const forYou = (insights ?? [])
    .filter((i) => !('listCode' in i && hero && i.listCode === hero.code))
    .slice(0, 3);

  return (
    <Screen {...useRefresh()}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <T size={20} weight={800} ls={-0.4}>
          Kolektorz
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            accessibilityLabel="Buscar"
            onPress={() => router.push('/buscar')}
            style={{
              width: 36,
              height: 36,
              borderWidth: 1,
              borderColor: c.divider,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke={c.text}
              strokeWidth={2}
            >
              <Circle cx={11} cy={11} r={8} />
              <Path d="m21 21-4.3-4.3" />
            </Svg>
          </Pressable>
          <Avatar />
        </View>
      </View>

      {sum && sum.items === 0 ? (
        <Empty />
      ) : (
        <>
          {hero ? (
            <View
              style={{
                backgroundColor: c.accent,
                paddingHorizontal: 20,
                paddingTop: 22,
                paddingBottom: 20,
              }}
            >
              <T
                size={11}
                weight={600}
                color={c.bg}
                style={{ letterSpacing: 1.3, textTransform: 'uppercase' }}
              >
                Discografía esencial
              </T>
              <T size={34} weight={800} lh={34} ls={-1} color={c.bg} style={{ marginTop: 10 }}>
                {essentialHeadline(hero)}
              </T>
              <View style={{ flexDirection: 'row', gap: 3, marginTop: 18 }}>
                {Array.from({ length: hero.total }, (_, i) => (
                  <View
                    key={i}
                    style={{
                      flex: 1,
                      height: 22,
                      borderWidth: 1.5,
                      borderColor: c.bg,
                      backgroundColor: i < hero.owned ? c.bg : 'transparent',
                    }}
                  />
                ))}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginTop: 14,
                }}
              >
                <T size={13} weight={600} color={c.bg} style={{ flex: 1 }}>
                  {essentialDetail(hero)}
                </T>
                {first ? (
                  wished ? (
                    <Pressable onPress={() => router.push('/wishlist')}>
                      <T size={13} weight={600} color={c.bg}>
                        En tu wishlist ✓
                      </T>
                    </Pressable>
                  ) : (
                    <Pressable
                      disabled={addMissing.isPending}
                      onPress={() =>
                        addMissing.mutate(first.albumId, {
                          onSuccess: () => toast.show(`Sumaste ${first.title} a tu wishlist.`),
                          onError: (e) => toast.show(errorMessage(e), 'error'),
                        })
                      }
                    >
                      <T size={13} weight={600} color={c.bg}>
                        Agregar a wishlist →
                      </T>
                    </Pressable>
                  )
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={[{ flexDirection: 'row' }, rule]}>
            <View style={{ flex: 1, paddingVertical: 14, paddingLeft: 20 }}>
              <T size={22} weight={800}>
                {num(sum?.items)}
              </T>
              <T size={12} muted>
                {sum?.items === 1 ? 'vinilo' : 'vinilos'}
              </T>
            </View>
            <View
              style={{
                flex: 1,
                padding: 14,
                paddingHorizontal: 12,
                borderLeftWidth: 1,
                borderLeftColor: c.divider,
              }}
            >
              <T size={18} weight={800} style={{ marginTop: 6 }}>
                {num(sum?.estimated)}
              </T>
              <T size={12} muted>
                {sum?.currency ?? 'USD'} estimado
              </T>
            </View>
            <View
              style={{
                flex: 1,
                padding: 14,
                paddingHorizontal: 12,
                borderLeftWidth: 1,
                borderLeftColor: c.divider,
              }}
            >
              <T
                size={18}
                weight={800}
                color={sum && sum.difference < 0 ? c.n600 : c.a700}
                style={{ marginTop: 6 }}
              >
                {signed(sum?.difference)}
              </T>
              <T size={12} muted>
                vs. invertido
              </T>
            </View>
          </View>

          <View style={[{ paddingTop: 16, paddingBottom: 16 }, rule]}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                marginBottom: 10,
              }}
            >
              <T kicker>Últimos agregados</T>
              <Pressable onPress={() => router.push('/coleccion')}>
                <T size={12} color={c.a700}>
                  Ver todos
                </T>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}
            >
              {recent?.items.map((a) => (
                <Pressable
                  key={a.id}
                  style={{ width: 128 }}
                  onPress={() => router.push(`/coleccion/${a.id}`)}
                >
                  <Cover url={a.coverImageUrl} size={128} label="portada" />
                  <T size={13} weight={700} lh={15.6} style={{ marginTop: 6 }}>
                    {a.title}
                  </T>
                  <T size={12} muted>
                    {a.artist}
                  </T>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={[{ padding: 20, paddingVertical: 16 }, rule]}>
            <Pressable
              onPress={() => router.push('/logros')}
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}
            >
              <T kicker>Logros</T>
              <T size={12} muted>
                {unlocked} de {achievements?.length ?? 0}
              </T>
            </Pressable>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {badgeRow(achievements).map((b) => (
                <View key={b.code} style={{ width: '25%', padding: 4, gap: 6 }}>
                  <View
                    style={{
                      aspectRatio: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...(b.unlocked
                        ? { backgroundColor: c.text }
                        : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.n400 }),
                    }}
                  >
                    <T size={18} weight={800} color={b.unlocked ? c.bg : c.n500}>
                      {badgeMark(b.name)}
                    </T>
                  </View>
                  <T size={10.5} lh={12.6} color={b.unlocked ? c.text : c.n600}>
                    {b.name}
                  </T>
                </View>
              ))}
            </View>
          </View>

          {forYou.length ? (
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
              <T kicker style={{ marginBottom: 6 }}>
                Para vos
              </T>
              {forYou.map((i) => (
                <Pressable
                  key={i.message}
                  onPress={() => router.push(mobileHref(insightHref(i)))}
                  style={[
                    {
                      paddingVertical: 12,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      gap: 12,
                    },
                    hair,
                  ]}
                >
                  <T size={14} lh={18.9} style={{ flex: 1 }}>
                    {i.message}
                  </T>
                  <T size={14} color={c.accent}>
                    →
                  </T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** Web routes → app routes (stats live on the web for now). */
function mobileHref(href: string) {
  return (href === '/estadisticas' ? '/logros' : href) as '/logros';
}

function facts(d: Dashboard) {
  const h = d.highlights;
  const cur = d.summary.currency;
  const out: [string, string][] = [];
  if (h.topArtist)
    out.push(['Artista más representado', `${h.topArtist.label} · ${h.topArtist.count}`]);
  if (h.topDecade) out.push(['Década predominante', `${h.topDecade.label} · ${h.topDecade.count}`]);
  if (h.topGenre)
    out.push([
      'Género predominante',
      `${h.topGenre.label} · ${pct(h.topGenre.count, d.summary.items)}`,
    ]);
  if (h.oldestEdition)
    out.push([
      'Edición más antigua',
      `${h.oldestEdition.title} · ${h.oldestEdition.releaseYear ?? '—'}`,
    ]);
  if (h.mostValuable)
    out.push([
      'Disco más valioso',
      `${h.mostValuable.title} · ${money(h.mostValuable.estimatedValue, cur)}`,
    ]);
  if (h.latestAddition)
    out.push([
      'Última incorporación',
      `${h.latestAddition.title} · ${relativeDay(h.latestAddition.addedAt)}`,
    ]);
  return out;
}

/** 1b — números primero. */
function Numbers() {
  const { data: d } = useDashboard();
  const { data: profile } = useProfile();
  const { data: achievements } = useAchievements();
  const sum = d?.summary;
  const cur = sum?.currency ?? 'USD';
  const decades = d?.charts.byDecade ?? [];
  const max = Math.max(1, ...decades.map((x) => x.count));
  const next = nextCountAchievement(achievements);
  const firstName = (profile?.displayName || profile?.username || '').split(' ')[0];
  const cell = {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderLeftColor: c.divider,
  } as const;
  return (
    <Screen {...useRefresh()}>
      <View
        style={[
          {
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          },
          rule,
        ]}
      >
        <View>
          <T size={12} muted>
            {firstName ? `Hola, ${firstName}` : 'Hola'}
          </T>
          <T size={22} weight={800} ls={-0.44}>
            Tu colección
          </T>
        </View>
        <Avatar />
      </View>
      {sum && sum.items === 0 ? (
        <Empty />
      ) : (
        <>
          <View style={[{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }, rule]}>
            <T size={96} weight={800} lh={86} ls={-4.8}>
              {num(sum?.items)}
            </T>
            <T size={15} weight={600} style={{ marginTop: 6 }}>
              {sum?.items === 1 ? 'vinilo' : 'vinilos'}
            </T>
          </View>
          <View style={[{ flexDirection: 'row' }, rule]}>
            {(
              [
                [sum?.artists, 'artistas'],
                [sum?.albums, 'álbumes'],
                [sum?.releases, 'ediciones'],
              ] as const
            ).map(([n, l], i) => (
              <View key={l} style={i ? cell : { flex: 1, paddingVertical: 14, paddingLeft: 20 }}>
                <T size={24} weight={800}>
                  {num(n)}
                </T>
                <T size={12} muted>
                  {l}
                </T>
              </View>
            ))}
          </View>
          <View style={rule}>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1, paddingVertical: 14, paddingLeft: 20 }}>
                <T size={12} muted>
                  Invertido
                </T>
                <T size={22} weight={800}>
                  {money(sum?.invested, cur)}
                </T>
              </View>
              <View style={cell}>
                <T size={12} muted>
                  Valor estimado*
                </T>
                <T size={22} weight={800}>
                  {money(sum?.estimated, cur)}
                </T>
              </View>
            </View>
            <View
              style={{
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: c.divider,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <T size={13}>Diferencia</T>
              <T size={18} weight={800} color={sum && sum.difference < 0 ? c.n600 : c.a700}>
                {signedMoney(sum?.difference, cur)}
              </T>
            </View>
          </View>
          <View style={[{ padding: 20, paddingVertical: 16 }, rule]}>
            <T kicker style={{ marginBottom: 12 }}>
              Por década
            </T>
            <View style={{ gap: 6 }}>
              {decades.map((x) => (
                <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T size={12} style={{ width: 48 }}>
                    {x.label}
                  </T>
                  <View style={{ flex: 1, height: 10, backgroundColor: c.surface }}>
                    <View
                      style={{
                        height: 10,
                        width: pct(x.count, max) as `${number}%`,
                        backgroundColor: x.count === max ? c.accent : c.text,
                      }}
                    />
                  </View>
                  <T size={12} weight={600} style={{ width: 28, textAlign: 'right' }}>
                    {x.count}
                  </T>
                </View>
              ))}
            </View>
          </View>
          {next ? (
            <View style={[{ padding: 20, paddingVertical: 16 }, rule]}>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}
              >
                <T kicker>Próximo logro</T>
                <T size={12} muted>
                  faltan {num(next.progress.target - next.progress.current)}
                </T>
              </View>
              <T size={18} weight={800}>
                {next.name}
              </T>
              <View style={{ height: 8, backgroundColor: c.surface, marginTop: 8 }}>
                <View
                  style={{
                    height: 8,
                    width: pct(next.progress.current, next.progress.target) as `${number}%`,
                    backgroundColor: c.accent,
                  }}
                />
              </View>
            </View>
          ) : null}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 }}>
            <T kicker style={{ marginBottom: 8 }}>
              Tu colección en números
            </T>
            {d
              ? facts(d).map(([k, v]) => (
                  <View
                    key={k}
                    style={[
                      {
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        gap: 12,
                        paddingVertical: 9,
                      },
                      hair,
                    ]}
                  >
                    <T size={13} muted>
                      {k}
                    </T>
                    <T size={13} weight={600} style={{ textAlign: 'right', flexShrink: 1 }}>
                      {v}
                    </T>
                  </View>
                ))
              : null}
            <T size={11} muted style={{ marginTop: 10 }}>
              * Estimación basada en datos de mercado. No es una tasación.
            </T>
          </View>
        </>
      )}
    </Screen>
  );
}
