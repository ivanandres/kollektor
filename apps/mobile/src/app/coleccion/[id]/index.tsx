import type { CollectionItem } from '@kollektor/api-client';
import {
  duration,
  essentialFor,
  metaRows,
  money,
  picturesOf,
  signedMoney,
  tags,
  valueNote,
} from '@kollektor/app-logic';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover } from '@/components/Cover';
import { T } from '@/components/T';
import { Cta, Empty, hair, rule } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useEssentials, useItem, useTrackLinks } from '@/lib/queries';
import { c, mono } from '@/lib/theme';

/** 1i — Ficha del vinilo. */
export default function Item() {
  const { id, tema } = useLocalSearchParams<{ id: string; tema?: string }>();
  const { data: item, isPending, error } = useItem(id);
  if (isPending) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (!item) return <Empty>{errorMessage(error)}</Empty>;
  return <Ficha item={item} openTrack={tema ?? null} />;
}

const TAG_STYLE = {
  accent: { bg: c.a100, fg: c.a800, border: 'transparent' },
  neutral: { bg: c.n100, fg: c.n800, border: 'transparent' },
  outline: { bg: 'transparent', fg: c.accent, border: c.accent },
} as const;

function Ficha({ item, openTrack }: { item: CollectionItem; openTrack: string | null }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: essentials } = useEssentials();
  const [open, setOpen] = useState<string | null>(openTrack);
  const pics = picturesOf(item);
  const [pic, setPic] = useState(0);
  const cover = pics[pic]?.url ?? null;
  const v = item.value;
  const cur = v.baseCurrency;
  const ess = essentialFor(item, essentials);
  const priv = [
    item.storageLocation,
    item.purchasePlace ? `comprado en ${item.purchasePlace}` : null,
  ].filter(Boolean);
  const cell = { flex: 1, padding: 12, borderLeftWidth: 1, borderLeftColor: c.divider } as const;
  const album = item.release.album;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <Cover url={cover} stripe={9}>
        <View
          style={{
            position: 'absolute',
            inset: 0,
            padding: 16,
            paddingTop: insets.top + 12,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/coleccion'))}
              style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <T size={13} weight={600}>
                ← Colección
              </T>
            </Pressable>
            <Pressable
              onPress={() => router.push(`/coleccion/${item.id}/editar`)}
              style={{ backgroundColor: c.bg, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <T size={13} weight={600}>
                Editar
              </T>
            </Pressable>
          </View>
          {cover ? null : (
            <T size={11} muted style={{ fontFamily: mono }}>
              portada · 1:1
            </T>
          )}
        </View>
      </Cover>
      {pics.length > 1 ? (
        <ScrollView
          horizontal
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 8 }}
        >
          {pics.map((p, i) => (
            <Pressable
              key={p.url}
              onPress={() => setPic(i)}
              style={{ borderWidth: i === pic ? 2 : 0, borderColor: c.text }}
            >
              <Cover url={p.url} size={56} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={[{ paddingHorizontal: 20, paddingVertical: 16 }, rule]}>
        <T size={14} weight={600}>
          {album.artistDisplay}
        </T>
        <T
          size={30}
          weight={800}
          lh={30.6}
          ls={-0.6}
          style={{ marginTop: 2 }}
          accessibilityRole="header"
        >
          {album.title}
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {tags(item).map((t) => (
            <View
              key={t.label}
              style={{
                backgroundColor: TAG_STYLE[t.kind].bg,
                borderWidth: 1,
                borderColor: TAG_STYLE[t.kind].border,
                paddingHorizontal: 10,
                paddingVertical: 3,
              }}
            >
              <T size={11} color={TAG_STYLE[t.kind].fg}>
                {t.label}
              </T>
            </View>
          ))}
        </View>
      </View>

      <View style={rule}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, paddingVertical: 12, paddingLeft: 20 }}>
            <T size={11} muted>
              Pagaste
            </T>
            <T size={20} weight={800} numberOfLines={1} adjustsFontSizeToFit>
              {money(v.paid, cur)}
            </T>
          </View>
          <View style={cell}>
            <T size={11} muted>
              Valor estimado
            </T>
            <T size={20} weight={800} numberOfLines={1} adjustsFontSizeToFit>
              {money(v.estimated, cur)}
            </T>
          </View>
          <View style={cell}>
            <T size={11} muted>
              Diferencia
            </T>
            <T
              size={20}
              weight={800}
              numberOfLines={1}
              adjustsFontSizeToFit
              color={v.difference != null && v.difference < 0 ? c.n600 : c.a700}
            >
              {signedMoney(v.difference, cur)}
            </T>
          </View>
        </View>
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: c.divider,
          }}
        >
          <T size={11} muted>
            {valueNote(item)}
          </T>
        </View>
      </View>

      <View style={[{ flexDirection: 'row', flexWrap: 'wrap' }, rule]}>
        {metaRows(item).map((m) => (
          <Pressable
            key={m.k}
            disabled={!m.href}
            onPress={() => m.href && Linking.openURL(m.href)}
            style={[{ width: '50%', paddingHorizontal: 20, paddingVertical: 10 }, hair]}
          >
            <T size={11} muted>
              {m.k}
            </T>
            <T
              size={14}
              weight={600}
              style={m.href ? { textDecorationLine: 'underline' } : undefined}
            >
              {m.v}
            </T>
          </Pressable>
        ))}
      </View>

      {ess ? (
        <Pressable
          onPress={() => router.push('/logros')}
          style={[{ paddingHorizontal: 20, paddingVertical: 14 }, rule]}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} weight={700}>
              {ess.artistName} esencial
            </T>
            <T size={13}>
              {ess.owned} / {ess.total}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 8 }}>
            {Array.from({ length: ess.total }, (_, i) => (
              <View
                key={i}
                style={{
                  flex: 1,
                  height: 8,
                  backgroundColor: i < ess.owned ? c.accent : c.surface,
                }}
              />
            ))}
          </View>
        </Pressable>
      ) : null}

      {item.notes ? (
        <View style={[{ paddingHorizontal: 20, paddingVertical: 14 }, rule]}>
          <T size={14}>{item.notes}</T>
        </View>
      ) : null}

      <T kicker style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
        Tracklist
      </T>
      {item.release.tracks.map((t) => (
        <Track
          key={t.id}
          track={t}
          open={open === t.id}
          onToggle={() => setOpen((o) => (o === t.id ? null : t.id))}
        />
      ))}
      {item.release.tracks.length === 0 ? <Empty>Sin tracklist cargado.</Empty> : null}

      <View style={{ borderTopWidth: 1, borderTopColor: c.divider, padding: 20, gap: 12 }}>
        {!item.release.isVerified ? (
          <Cta
            label="Vincular con Discogs"
            onPress={() =>
              router.push(
                `/agregar?vincular=${item.id}&q=${encodeURIComponent(`${album.artistDisplay} ${album.title}`)}`,
              )
            }
          />
        ) : (
          <Cta
            variant="secondary"
            label="Otras ediciones de este álbum"
            onPress={() =>
              router.push(
                `/agregar?album=${album.id}&titulo=${encodeURIComponent(`${album.artistDisplay} — ${album.title}`)}`,
              )
            }
          />
        )}
        {priv.length ? (
          <View
            style={{
              backgroundColor: c.surface,
              paddingHorizontal: 14,
              paddingVertical: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <T size={13} style={{ flex: 1 }}>
              <T size={13} weight={700}>
                Solo vos
              </T>{' '}
              · {priv.join(' · ')}
            </T>
            <T size={11} weight={600} style={{ letterSpacing: 0.9, textTransform: 'uppercase' }}>
              Privado
            </T>
          </View>
        ) : null}
        <T size={12} muted>
          Ubicación física y precio pagado: solo visibles para vos.
          {item.release.external.some((e) => e.source === 'discogs')
            ? ' Datos provistos por Discogs.'
            : ''}
        </T>
      </View>
    </ScrollView>
  );
}

type Tr = CollectionItem['release']['tracks'][number];

function Track({ track, open, onToggle }: { track: Tr; open: boolean; onToggle: () => void }) {
  const { data, isPending, isError } = useTrackLinks(track.id, open);
  const found = (l: { status: string; url?: string } | undefined) =>
    l?.status === 'found' ? l.url : undefined;
  const sp = found(data?.links.spotify);
  const yt = found(data?.links.youtube);
  const ly = found(data?.lyrics);
  const btn = (label: string, url: string, ghost = false) => (
    <Pressable
      key={label}
      onPress={() => Linking.openURL(url)}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: ghost ? 0 : 1,
        borderColor: c.divider,
      }}
    >
      <T size={12} weight={800} color={ghost ? c.accent : c.text}>
        {label} ↗
      </T>
    </Pressable>
  );
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.divider }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 20,
          paddingVertical: 12,
          backgroundColor: open ? c.surface : 'transparent',
        }}
      >
        <T size={12} weight={600} muted style={{ width: 36, fontFamily: mono }}>
          {track.position}
        </T>
        <T size={15} weight={600} style={{ flex: 1 }}>
          {track.title}
        </T>
        <T size={12} muted>
          {duration(track.durationSeconds)}
        </T>
      </Pressable>
      {open ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            paddingLeft: 64,
            paddingRight: 20,
            paddingBottom: 12,
            backgroundColor: c.surface,
          }}
        >
          {isPending ? (
            <T size={12} muted>
              Buscando links…
            </T>
          ) : isError ? (
            <T size={12} muted>
              No pudimos buscar los links. Probá más tarde.
            </T>
          ) : !sp && !yt && !ly ? (
            <T size={12} muted>
              {data && Object.keys(data.links).length === 0
                ? 'Los links de música no están disponibles por ahora.'
                : 'No encontramos este tema en Spotify ni YouTube.'}
            </T>
          ) : (
            [sp && btn('Spotify', sp), yt && btn('YouTube', yt), ly && btn('Ver letra', ly, true)]
          )}
        </View>
      ) : null}
    </View>
  );
}
