import type { WishlistItem } from '@kollektor/api-client';
import { editionLine, money, parseAmount, PRIORITY_LABEL } from '@kollektor/app-logic';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CopyForm, copyToFields, emptyCopy, type CopyValues } from '@/components/CopyForm';
import { Cover } from '@/components/Cover';
import { Sheet } from '@/components/Sheet';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { Cta, Empty, Field, hair, Segmented } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useInvalidateAll, useProfile, useWishlist } from '@/lib/queries';
import { c, mono } from '@/lib/theme';

type Status = WishlistItem['status'];
const TABS: [Status, string][] = [
  ['wanted', 'Quiero'],
  ['searching', 'Buscando'],
  ['found', 'Encontrado'],
  ['purchased', 'Comprado'],
];
const ed = (w: WishlistItem) =>
  w.release
    ? editionLine(w.release.country, w.release.releaseYear, w.release.editionType)
    : 'Cualquier edición';

/** 1j — Wishlist "Quiero comprar" por estado. */
export default function Wishlist() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isPending, refetch, isRefetching } = useWishlist();
  const [tab, setTab] = useState<Status>('wanted');
  const [editing, setEditing] = useState<WishlistItem | null>(null);
  const [buying, setBuying] = useState<WishlistItem | null>(null);
  const items = (data ?? []).filter((w) => w.status === tab);
  const count = (s: Status) => (data ?? []).filter((w) => w.status === s).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <T size={30} weight={800} ls={-0.6}>
          Quiero comprar
        </T>
        <Pressable
          accessibilityLabel="Sumar a la wishlist"
          onPress={() => router.push('/agregar?destino=wishlist')}
          hitSlop={10}
        >
          <T size={22} weight={800} color={c.accent}>
            +
          </T>
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 2,
          borderBottomWidth: 2,
          borderColor: c.divider,
        }}
      >
        {TABS.map(([s, label], i) => {
          const on = s === tab;
          return (
            <Pressable
              key={s}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setTab(s)}
              style={{
                flex: 1,
                paddingHorizontal: 10,
                paddingVertical: 12,
                backgroundColor: on ? c.text : 'transparent',
                borderLeftWidth: i ? 1 : 0,
                borderLeftColor: c.divider,
              }}
            >
              <T size={13} weight={700} color={on ? c.bg : c.text}>
                {label}{' '}
                <T size={13} color={on ? c.bg : c.text} style={{ opacity: 0.75 }}>
                  {count(s)}
                </T>
              </T>
            </Pressable>
          );
        })}
      </View>
      <FlatList
        data={items}
        keyExtractor={(w) => w.id}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={isPending ? null : <Empty>Nada en este estado todavía.</Empty>}
        renderItem={({ item: w }) => (
          <View
            style={[
              { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14 },
              hair,
            ]}
          >
            <Cover url={w.album.coverImageUrl} size={72} stripe={5} />
            <View style={{ flex: 1 }}>
              <Pressable
                onPress={() => (w.status === 'purchased' ? null : setEditing(w))}
                accessibilityLabel={`Editar ${w.album.title}`}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <T size={15} weight={800} lh={18} style={{ flex: 1 }}>
                    {w.album.title}
                  </T>
                  <T
                    size={11}
                    weight={600}
                    color={w.priority === 1 ? c.a700 : c.n600}
                    style={{ fontFamily: mono }}
                  >
                    {PRIORITY_LABEL[w.priority] ?? ''}
                  </T>
                </View>
                <T size={12} muted>
                  {w.album.artistDisplay} · {ed(w)}
                </T>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}
                >
                  <T size={12}>
                    Objetivo{' '}
                    <T size={12} weight={700}>
                      {w.targetPrice != null ? money(w.targetPrice, w.targetCurrency) : '—'}
                    </T>
                  </T>
                  <T
                    size={12}
                    color={w.belowTarget ? c.a700 : c.n700}
                    weight={w.belowTarget ? 600 : 400}
                  >
                    {w.market
                      ? `Mercado ~${money(w.market.lowest, w.market.currency)}`
                      : 'Mercado —'}
                  </T>
                </View>
              </Pressable>
              {w.status === 'found' ? (
                <Cta
                  label="Agregar a mi colección"
                  onPress={() => setBuying(w)}
                  style={{ marginTop: 10, minHeight: 44 }}
                />
              ) : null}
              {w.status === 'purchased' && w.collectionItemId ? (
                <Cta
                  variant="secondary"
                  label="Ver en mi colección"
                  onPress={() => router.push(`/coleccion/${w.collectionItemId}`)}
                  style={{ marginTop: 10, minHeight: 44 }}
                />
              ) : null}
            </View>
          </View>
        )}
      />
      {editing ? (
        <EditSheet
          item={editing}
          onClose={() => setEditing(null)}
          onBuy={() => (setBuying(editing), setEditing(null))}
        />
      ) : null}
      {buying ? <BuySheet item={buying} onClose={() => setBuying(null)} /> : null}
    </View>
  );
}

function EditSheet({
  item,
  onClose,
  onBuy,
}: {
  item: WishlistItem;
  onClose: () => void;
  onBuy: () => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [status, setStatus] = useState<Exclude<Status, 'purchased'>>(
    item.status === 'purchased' ? 'found' : item.status,
  );
  const [priority, setPriority] = useState(item.priority);
  const [target, setTarget] = useState(item.targetPrice != null ? String(item.targetPrice) : '');
  const [busy, setBusy] = useState(false);
  const cur = item.targetCurrency ?? profile?.baseCurrency ?? 'USD';

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      await invalidate();
      if (done) toast.show(done);
      onClose();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} label={item.album.title}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <T size={20} weight={800} lh={23}>
            {item.album.title}
          </T>
          <T size={12} muted>
            {item.album.artistDisplay} · {ed(item)}
          </T>
        </View>
        <Pressable
          onPress={() =>
            run(() => api.wishlist.remove(item.id), `Sacaste ${item.album.title} de tu wishlist.`)
          }
        >
          <T size={13} weight={600} color={c.a700}>
            Quitar
          </T>
        </Pressable>
      </View>
      <T kicker>Estado</T>
      <Segmented
        options={[
          ['wanted', 'Quiero'],
          ['searching', 'Buscando'],
          ['found', 'Encontrado'],
        ]}
        value={status}
        onChange={setStatus}
      />
      <T kicker>Prioridad</T>
      <Segmented
        options={[
          [1, 'Alta'],
          [2, 'Media'],
          [3, 'Baja'],
        ]}
        value={priority}
        onChange={setPriority}
      />
      <Field
        big
        label={`Precio objetivo (${cur})`}
        keyboardType="decimal-pad"
        placeholder="0"
        value={target}
        onChangeText={setTarget}
      />
      {item.market ? (
        <View style={{ backgroundColor: c.surface, padding: 12 }}>
          <T size={12}>
            La copia más barata a la venta hoy:{' '}
            <T size={12} weight={700}>
              {money(item.market.lowest, item.market.currency)}
            </T>{' '}
            · Discogs Marketplace.
          </T>
        </View>
      ) : null}
      <Cta
        variant="secondary"
        label="Guardar"
        end="✓"
        busy={busy}
        onPress={() =>
          run(() => {
            const price = parseAmount(target);
            return api.wishlist.update(item.id, {
              status,
              priority,
              targetPrice: price,
              targetCurrency: price != null ? cur : null,
            });
          })
        }
      />
      <Cta label="Lo compré — agregar a mi colección" onPress={onBuy} />
    </Sheet>
  );
}

function BuySheet({ item, onClose }: { item: WishlistItem; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [values, setValues] = useState<CopyValues>(() => ({
    ...emptyCopy(item.market?.currency ?? profile?.baseCurrency ?? 'USD'),
    purchasePrice: item.market ? String(item.market.lowest).replace('.', ',') : '',
  }));
  const [busy, setBusy] = useState(false);
  const needsEdition = !item.release && !item.album.mainReleaseId;
  const pick = `/agregar?q=${encodeURIComponent(`${item.album.artistDisplay} ${item.album.title}`)}&wishlist=${item.id}`;

  async function buy() {
    setBusy(true);
    try {
      const edition = item.release
        ? {}
        : item.album.mainReleaseId
          ? { releaseId: item.album.mainReleaseId }
          : {};
      const res = await api.wishlist.purchase(item.id, { ...edition, ...copyToFields(values) });
      await invalidate();
      toast.show(`Agregaste ${item.album.title} a tu colección.`);
      toast.celebrate(res.unlockedAchievements);
      onClose();
      router.push(`/coleccion/${res.item.id}`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} label="Agregar a mi colección">
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Cover url={item.album.coverImageUrl} size={56} stripe={5} />
        <View style={{ flex: 1 }}>
          <T size={18} weight={800}>
            {item.album.title}
          </T>
          <T size={12} muted>
            {item.album.artistDisplay} · {ed(item)}
          </T>
        </View>
      </View>
      {needsEdition ? (
        <>
          <View style={{ backgroundColor: c.surface, padding: 12 }}>
            <T size={13}>
              Este disco está en tu wishlist sin una edición elegida. Buscala en Discogs para
              guardarla con su tracklist y su valor.
            </T>
          </View>
          <Cta
            label="Elegir la edición que compré"
            onPress={() => (onClose(), router.push(pick as '/agregar'))}
          />
        </>
      ) : (
        <>
          <CopyForm value={values} onChange={setValues} />
          <Cta label="Guardar en colección" end="✓" busy={busy} onPress={buy} />
          <Pressable onPress={() => (onClose(), router.push(pick as '/agregar'))}>
            <T size={13} color={c.accent} style={{ textDecorationLine: 'underline' }}>
              Compré otra edición →
            </T>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}
