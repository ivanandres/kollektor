import type { Achievement } from '@kollektor/api-client';
import { badgeMark, num, pct, shortDate, wishedMatcher } from '@kollektor/app-logic';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { hair, rule } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  useAchievements,
  useAddMissingToWishlist,
  useEssentials,
  useWishlist,
} from '@/lib/queries';
import { c } from '@/lib/theme';

const CATEGORY: Record<string, string> = {
  coleccion: 'Colección',
  diversidad: 'Diversidad',
  tiempo: 'Épocas',
  artistas: 'Artistas',
  paises: 'Países',
  rareza: 'Rarezas',
  discografias: 'Discografías completas',
};

/** Logros: discografías esenciales con lo que falta, y logros con su progreso. */
export default function Achievements() {
  const router = useRouter();
  const toast = useToast();
  const { data: achievements } = useAchievements();
  const { data: essentials } = useEssentials();
  const { data: wishlist } = useWishlist();
  const add = useAddMissingToWishlist();
  const isWished = wishedMatcher(wishlist);
  const unlocked = achievements?.filter((a) => a.unlocked).length ?? 0;
  const lists = [...(essentials ?? [])].sort(
    (a, b) => Number(a.complete) - Number(b.complete) || b.owned / b.total - a.owned / a.total,
  );
  const groups = Object.entries(
    (achievements ?? []).reduce<Record<string, Achievement[]>>(
      (acc, a) => ((acc[a.category] ??= []).push(a), acc),
      {},
    ),
  );

  return (
    <Screen
      header={
        <View
          style={[
            {
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            },
            rule,
          ]}
        >
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <T size={14} weight={600}>
              ←
            </T>
          </Pressable>
          <T size={30} weight={800} ls={-0.6} style={{ flex: 1, marginLeft: 12 }}>
            Logros
          </T>
          <T size={13} muted>
            {unlocked} de {achievements?.length ?? 0}
          </T>
        </View>
      }
    >
      <View style={[{ padding: 20, paddingVertical: 16 }, rule]}>
        <T kicker style={{ marginBottom: 8 }}>
          Discografías esenciales
        </T>
        {lists.map((e) => (
          <View key={e.code} style={[{ paddingTop: 10, paddingBottom: 14 }, hair]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T size={14} weight={700}>
                {e.artistName}
              </T>
              <T size={14}>
                {e.owned} / {e.total}
                {e.complete ? ' ✓' : ''}
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 3, marginTop: 8 }}>
              {Array.from({ length: e.total }, (_, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 8,
                    backgroundColor: i < e.owned ? c.accent : c.surface,
                  }}
                />
              ))}
            </View>
            {e.missing.map((m) => (
              <View
                key={m.albumId}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingVertical: 4,
                  marginTop: 4,
                }}
              >
                <T size={13} style={{ flex: 1 }}>
                  {m.title}
                  {m.year ? (
                    <T size={12} muted>
                      {' '}
                      · {m.year}
                    </T>
                  ) : null}
                </T>
                {isWished(m.albumId, m.title, e.artistName) ? (
                  <T size={12} muted>
                    en wishlist
                  </T>
                ) : (
                  <Pressable
                    disabled={add.isPending}
                    onPress={() =>
                      add.mutate(m.albumId, {
                        onSuccess: () => toast.show(`Sumaste ${m.title} a tu wishlist.`),
                        onError: (err) => toast.show(errorMessage(err), 'error'),
                      })
                    }
                  >
                    <T size={12} weight={600} color={c.a700}>
                      + Wishlist
                    </T>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
      {groups.map(([cat, list]) => (
        <View key={cat} style={[{ padding: 20, paddingVertical: 16, gap: 14 }, rule]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T kicker>{CATEGORY[cat] ?? cat}</T>
            <T size={12} muted>
              {list.filter((a) => a.unlocked).length} de {list.length}
            </T>
          </View>
          {list.map((a) => (
            <View key={a.code} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(a.unlocked
                    ? { backgroundColor: c.text }
                    : { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.n400 }),
                }}
              >
                <T size={16} weight={800} color={a.unlocked ? c.bg : c.n500}>
                  {badgeMark(a.name)}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={14} weight={700} color={a.unlocked ? c.text : c.n700}>
                  {a.name}
                </T>
                <T size={12} muted>
                  {a.description}
                </T>
                {a.unlocked ? (
                  <T size={11} muted>
                    Desbloqueado el {shortDate(a.unlockedAt, true)}
                  </T>
                ) : (
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}
                  >
                    <View style={{ flex: 1, height: 6, backgroundColor: c.surface }}>
                      <View
                        style={{
                          height: 6,
                          width: pct(a.progress.current, a.progress.target) as `${number}%`,
                          backgroundColor: c.accent,
                        }}
                      />
                    </View>
                    <T size={11} weight={600}>
                      {num(a.progress.current)}/{num(a.progress.target)}
                    </T>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}
