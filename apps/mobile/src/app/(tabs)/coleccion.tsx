import type { CollectionListItem } from '@kollektor/api-client';
import {
  activeChips,
  activeCount,
  editionLine,
  formatShort,
  money,
  num,
  shelfName,
  SORT_LABEL,
  type CollectionFilters,
} from '@kollektor/app-logic';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CondBadge, Cover } from '@/components/Cover';
import { FilterSheet } from '@/components/FilterSheet';
import { GridIcon, ListIcon, SearchIcon, ShelfIcon } from '@/components/icons';
import { T } from '@/components/T';
import { Chip, Empty, hair } from '@/components/ui';
import { usePref } from '@/lib/prefs';
import { useCollectionInfinite, useFacets, useProfile } from '@/lib/queries';
import { c, font, mono } from '@/lib/theme';

const VIEWS = ['grid', 'lista', 'estante'] as const;
type View_ = (typeof VIEWS)[number];

/** 1d — Colección grid / lista, and 1e — estante de lomos. */
export default function Collection() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    artistId?: string;
    albumId?: string;
    genre?: string;
    decade?: string;
  }>();
  const [view, setView] = usePref<View_>('coleccion', 'grid', VIEWS);
  const [filters, setFilters] = useState<CollectionFilters>({});
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState(false);
  const { data: facets } = useFacets();
  const { data: profile } = useProfile();
  const currency = profile?.baseCurrency ?? 'USD';

  // Deep links from other screens (búsqueda, dashboard) preset a filter.
  useEffect(() => {
    const f: CollectionFilters = {};
    if (params.artistId) f.artistId = [params.artistId];
    if (params.albumId) f.albumId = [params.albumId];
    if (params.genre) f.genre = [params.genre];
    if (params.decade) f.decade = [Number(params.decade)];
    if (Object.keys(f).length) setFilters(f);
  }, [params.artistId, params.albumId, params.genre, params.decade]);

  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, q: text.trim() || undefined })), 300);
    return () => clearTimeout(t);
  }, [text]);

  const query = useMemo(
    () => ({
      ...filters,
      ...(view === 'estante' ? { sort: 'artist_asc' as const, pageSize: 200 } : {}),
    }),
    [filters, view],
  );
  const list = useCollectionInfinite(query);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const total = list.data?.pages[0]?.total;
  const chips = activeChips(filters, facets, currency);
  const n = activeCount(filters);
  const shelf = view === 'estante';

  const header = (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 8 + insets.top,
        paddingBottom: 12,
        borderBottomWidth: 2,
        borderBottomColor: c.divider,
        backgroundColor: c.bg,
      }}
    >
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <T size={30} weight={800} ls={-0.6}>
          {shelf ? 'Estante' : 'Colección'}
        </T>
        {shelf ? (
          <T size={13} muted>
            A–Z por artista
          </T>
        ) : (
          <T size={14} weight={600} muted>
            {total != null ? num(total) : ''}
          </T>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            height: 44,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.divider,
          }}
        >
          <SearchIcon color={c.n700} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Artista, álbum, tema, sello…"
            placeholderTextColor={c.n700}
            accessibilityLabel="Buscar en tu colección"
            returnKeyType="search"
            style={{ flex: 1, fontFamily: font(400), fontSize: 14, color: c.text }}
          />
        </View>
        <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.divider }}>
          {(
            [
              ['grid', 'Grid', GridIcon],
              ['lista', 'Lista', ListIcon],
              ['estante', 'Estante', ShelfIcon],
            ] as const
          ).map(([v, label, Icon], i) => (
            <Pressable
              key={v}
              accessibilityLabel={label}
              accessibilityState={{ selected: view === v }}
              onPress={() => setView(v)}
              style={{
                width: 44,
                height: 42,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: view === v ? c.text : 'transparent',
                borderLeftWidth: i ? 1 : 0,
                borderLeftColor: c.divider,
              }}
            >
              <Icon color={view === v ? c.bg : c.text} />
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, marginTop: 10 }}
      >
        <Chip tone="solid" label={`Filtros${n ? ` · ${n}` : ''}`} onPress={() => setSheet(true)} />
        {chips.map((ch) => (
          <Chip
            key={ch.key}
            tone="accent"
            label={`${ch.label} ×`}
            onPress={() => setFilters(ch.remove(filters))}
          />
        ))}
        {!shelf ? (
          <Chip
            label={`Orden: ${SORT_LABEL[filters.sort ?? 'added_desc']}`}
            onPress={() => setSheet(true)}
          />
        ) : null}
      </ScrollView>
    </View>
  );

  const empty = list.isPending ? null : (
    <Empty>
      {n || filters.q
        ? 'Ningún vinilo cumple todos los filtros.'
        : 'Tu colección está vacía. Tocá + para agregar tu primer vinilo.'}
    </Empty>
  );
  const open = (id: string) => router.push(`/coleccion/${id}`);
  const more = () => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      {shelf ? (
        <Shelf items={items} currency={currency} onOpen={open} />
      ) : view === 'grid' ? (
        <FlatList
          key="grid"
          data={items}
          numColumns={2}
          keyExtractor={(a) => a.id}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 24,
            gap: 16,
          }}
          ListEmptyComponent={empty}
          onEndReached={more}
          onEndReachedThreshold={0.6}
          renderItem={({ item: a }) => (
            <Pressable style={{ flex: 1 / 2 }} onPress={() => open(a.id)}>
              <Cover url={a.coverImageUrl} label="portada">
                {a.conditionMedia ? <CondBadge>{a.conditionMedia}</CondBadge> : null}
              </Cover>
              <T size={14} weight={700} lh={16.8} style={{ marginTop: 6 }}>
                {a.title}
              </T>
              <T size={12} muted>
                {a.artist}
                {a.originalReleaseYear ? ` · ${a.originalReleaseYear}` : ''}
              </T>
              <T size={12} weight={600} style={{ marginTop: 2 }}>
                {money(a.estimatedValueBase, a.baseCurrency ?? currency)}
              </T>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key="list"
          data={items}
          keyExtractor={(a) => a.id}
          ListEmptyComponent={empty}
          onEndReached={more}
          onEndReachedThreshold={0.6}
          renderItem={({ item: a }) => (
            <Pressable
              onPress={() => open(a.id)}
              style={[
                {
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                },
                hair,
              ]}
            >
              <Cover url={a.coverImageUrl} size={56} stripe={5} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T size={14} weight={700} numberOfLines={1}>
                  {a.title}
                </T>
                <T size={12} muted>
                  {a.artist}
                  {a.originalReleaseYear ? ` · ${a.originalReleaseYear}` : ''}
                </T>
                <T size={11} muted numberOfLines={1}>
                  {editionLine(a.country, a.releaseYear, a.editionType)} ·{' '}
                  {formatShort(a.formatSummary)}
                  {a.conditionMedia ? ` · ${a.conditionMedia}` : ''}
                </T>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <T size={13} weight={700}>
                  {money(a.estimatedValueBase, a.baseCurrency ?? currency)}
                </T>
                {a.purchasePriceBase != null ? (
                  <T size={11} muted>
                    pagué {num(a.purchasePriceBase)}
                  </T>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
      <FilterSheet
        open={sheet}
        value={filters}
        onChange={setFilters}
        count={total}
        currency={currency}
        onClose={() => setSheet(false)}
      />
    </View>
  );
}

const SPINE_BG = [c.text, c.surface, c.n300, c.bg, c.n700, c.surface];
const DARK = new Set([0, 4]);
function spineHeight(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 44 + (h % 18);
}

/** 1e — lomos A–Z ("The" ignored); tap to preview, tap the preview to open. */
function Shelf({
  items,
  currency,
  onOpen,
}: {
  items: CollectionListItem[];
  currency: string;
  onOpen: (id: string) => void;
}) {
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          shelfName(a.artist).localeCompare(shelfName(b.artist), 'es') ||
          (a.originalReleaseYear ?? 0) - (b.originalReleaseYear ?? 0),
      ),
    [items],
  );
  const [selId, setSelId] = useState<string | null>(null);
  const sel = sorted.find((x) => x.id === selId) ?? sorted[0];
  return (
    <>
      <FlatList
        style={{ flex: 1 }}
        data={sorted}
        keyExtractor={(a) => a.id}
        renderItem={({ item: a, index: i }) => {
          const on = a.id === sel?.id;
          const dark = on || DARK.has(i % SPINE_BG.length);
          const fg = dark ? c.bg : c.text;
          return (
            <Pressable
              accessibilityState={{ selected: on }}
              onPress={() => setSelId(a.id)}
              style={{
                height: spineHeight(a.id),
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 20,
                backgroundColor: on ? c.accent : SPINE_BG[i % SPINE_BG.length],
                borderBottomWidth: 1,
                borderBottomColor: c.divider,
              }}
            >
              <T
                size={11}
                weight={600}
                color={fg}
                style={{ width: 34, fontFamily: mono, opacity: 0.7 }}
              >
                {shelfName(a.artist)[0]?.toUpperCase()}
              </T>
              <T
                size={15}
                weight={800}
                color={fg}
                numberOfLines={1}
                style={{ flex: 1, textTransform: 'uppercase', letterSpacing: 0.15 }}
              >
                {a.artist} — {a.title}
              </T>
              <T size={11} weight={600} color={fg}>
                {a.originalReleaseYear ?? ''}
              </T>
            </Pressable>
          );
        }}
      />
      {sel ? (
        <Pressable
          onPress={() => onOpen(sel.id)}
          style={{
            flexDirection: 'row',
            gap: 12,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderTopWidth: 2,
            borderTopColor: c.divider,
            backgroundColor: c.surface,
          }}
        >
          <Cover url={sel.coverImageUrl} size={72} stripe={5} />
          <View style={{ flex: 1 }}>
            <T size={15} weight={800} lh={18}>
              {sel.title}
            </T>
            <T size={12} muted>
              {sel.artist} · {editionLine(sel.country, sel.releaseYear, sel.editionType)}
            </T>
            <T size={12} style={{ marginTop: 4 }}>
              <T size={12} weight={700}>
                {money(sel.estimatedValueBase, sel.baseCurrency ?? currency)}
              </T>{' '}
              est.
              {sel.purchasePriceBase != null
                ? ` · pagué ${money(sel.purchasePriceBase, sel.baseCurrency ?? currency)}`
                : ''}
            </T>
          </View>
        </Pressable>
      ) : null}
    </>
  );
}
