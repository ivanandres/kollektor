import type { SearchResults } from '@kollektor/api-client';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover } from '@/components/Cover';
import { SearchIcon } from '@/components/icons';
import { T } from '@/components/T';
import { Chip, hair } from '@/components/ui';
import { api } from '@/lib/api';
import { useFacets, useSearch } from '@/lib/queries';
import { c, font, mono } from '@/lib/theme';

/** 1f — Buscador global. */
export default function Search() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data } = useSearch(debounced);
  const { data: facets } = useFacets();
  const suggestions = [
    ...(facets?.artists.slice(0, 3).map((a) => a.value) ?? []),
    facets?.labels[0]?.value,
    facets?.genres[0]?.value,
  ].filter((x): x is string => !!x);
  const r: SearchResults | undefined = debounced && data ? data : undefined;
  const total = r ? r.artists.length + r.albums.length + r.releases.length + r.tracks.length : 0;

  const openAlbum = async (a: SearchResults['albums'][number]) => {
    if (a.itemCount === 0) return router.push('/wishlist');
    const page = await api.collection.list({ albumId: [a.id], pageSize: 2 });
    if (page.total === 1 && page.items[0]) router.push(`/coleccion/${page.items[0].id}`);
    else router.push(`/coleccion?albumId=${a.id}`);
  };
  const group = (title: string) => (
    <View style={{ paddingHorizontal: 20, paddingVertical: 6, backgroundColor: c.surface }}>
      <T kicker>{title}</T>
    </View>
  );
  const row = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          borderBottomWidth: 2,
          borderBottomColor: c.divider,
        }}
      >
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 48,
              height: 48,
              borderWidth: 1,
              borderColor: c.divider,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T size={18} weight={600}>
              ←
            </T>
          </Pressable>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 12,
              height: 48,
              backgroundColor: c.surface,
              borderWidth: 2,
              borderColor: c.accent,
            }}
          >
            <SearchIcon size={18} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Artista, álbum, tema, sello…"
              placeholderTextColor={c.n700}
              accessibilityLabel="Buscar"
              returnKeyType="search"
              style={{ flex: 1, fontFamily: font(400), fontSize: 16, color: c.text }}
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {suggestions.map((s) => (
            <Chip
              key={s}
              label={s}
              on={q.trim().toLowerCase() === s.toLowerCase()}
              onPress={() => setQ(s)}
            />
          ))}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        {r ? (
          <T size={12} muted style={{ paddingHorizontal: 20, paddingVertical: 10 }}>
            {total} resultado{total === 1 ? '' : 's'} para “{debounced}”
          </T>
        ) : (
          <T size={13} muted style={{ padding: 20 }}>
            Busca en artistas, álbumes, temas, sellos, catálogo y año. Tolera errores de tipeo y
            combina palabras (“floyd money”, “emi 1973”).
          </T>
        )}
        {r?.artists.length ? group('Artistas') : null}
        {r?.artists.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => router.push(`/coleccion?artistId=${a.id}`)}
            style={[row, hair]}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.n300 }} />
            <View>
              <T size={15} weight={700}>
                {a.name}
              </T>
              <T size={12} muted>
                {a.itemCount} en tu colección
              </T>
            </View>
          </Pressable>
        ))}
        {r?.albums.length ? group('Álbumes') : null}
        {r?.albums.map((a) => (
          <Pressable key={a.id} onPress={() => openAlbum(a)} style={[row, hair]}>
            <Cover url={a.coverImageUrl} size={40} stripe={4} />
            <View style={{ flex: 1 }}>
              <T size={15} weight={700}>
                {a.title}
              </T>
              <T size={12} muted>
                {a.artist}
                {a.year ? ` · ${a.year}` : ''}
                {a.itemCount === 0 && a.inWishlist ? ' · en wishlist' : ''}
              </T>
            </View>
          </Pressable>
        ))}
        {r?.tracks.length ? group('Temas') : null}
        {r?.tracks.map((t) => (
          <Pressable
            key={t.id}
            onPress={() =>
              t.collectionItemId
                ? router.push(`/coleccion/${t.collectionItemId}?tema=${t.id}`)
                : router.push('/wishlist')
            }
            style={[row, hair]}
          >
            <T size={12} weight={600} muted style={{ width: 40, fontFamily: mono }}>
              {t.position}
            </T>
            <View style={{ flex: 1 }}>
              <T size={15} weight={700}>
                {t.title}
              </T>
              <T size={12} muted>
                en {t.albumTitle} — {t.artist}
              </T>
            </View>
          </Pressable>
        ))}
        {r?.releases.length ? group('Ediciones · sello · catálogo') : null}
        {r?.releases.map((e) => (
          <Pressable
            key={e.id}
            onPress={() =>
              e.collectionItemIds[0] && router.push(`/coleccion/${e.collectionItemIds[0]}`)
            }
            style={[{ paddingHorizontal: 20, paddingVertical: 10 }, hair]}
          >
            <T size={15} weight={700}>
              {e.albumTitle}{' '}
              <T size={15} muted>
                — {e.artist}
              </T>
            </T>
            <T size={12} muted>
              {[e.labels, e.catalogNumbers, e.country, e.releaseYear].filter(Boolean).join(' · ')}
            </T>
          </Pressable>
        ))}
        {r && total === 0 ? (
          <Pressable
            onPress={() => router.push(`/agregar?q=${encodeURIComponent(debounced)}`)}
            style={{ padding: 20 }}
          >
            <T size={14}>
              Nada en tu colección.{' '}
              <T size={14} color={c.accent} style={{ textDecorationLine: 'underline' }}>
                Buscar en Discogs →
              </T>
            </T>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
