import {
  blank,
  CONDITIONS,
  parseTracklist,
  toInput,
  type FieldKey,
  type Values,
} from '@kollektor/app-logic';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CURRENCIES } from '@/components/CopyForm';
import { FlowBar } from '@/components/FlowBar';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { Chip, Cta, Field } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useInvalidateAll, useProfile } from '@/lib/queries';
import { c, mono } from '@/lib/theme';

interface F {
  key: FieldKey;
  label: string;
  ph?: string;
  half?: boolean;
  multiline?: boolean;
  numeric?: boolean;
  options?: [string, string][];
}
const COND: [string, string][] = [['', '—'], ...CONDITIONS.map((x): [string, string] => [x, x])];
const SECTIONS: { n: string; title: string; sub: string; fields: F[] }[] = [
  {
    n: '01',
    title: 'Álbum',
    sub: 'Artista, título, año, género, tracklist',
    fields: [
      { key: 'artist', label: 'Artista', ph: 'Pink Floyd' },
      { key: 'title', label: 'Título', ph: 'Meddle' },
      { key: 'year', label: 'Año original', ph: '1971', half: true, numeric: true },
      { key: 'genre', label: 'Género', ph: 'Rock', half: true },
      { key: 'style', label: 'Estilo', ph: 'Prog Rock' },
      {
        key: 'tracklist',
        label: 'Tracklist',
        ph: 'A1 One of These Days 5:57\nA2 A Pillow of Winds',
        multiline: true,
      },
    ],
  },
  {
    n: '02',
    title: 'Edición',
    sub: 'País, sello, catálogo, formato, condición',
    fields: [
      { key: 'editionYear', label: 'Año de edición', ph: '1971', half: true, numeric: true },
      { key: 'country', label: 'País', ph: 'UK', half: true },
      { key: 'label', label: 'Sello', ph: 'Harvest', half: true },
      { key: 'catalog', label: 'Catálogo', ph: 'SHVL 795', half: true },
      {
        key: 'format',
        label: 'Formato',
        options: ['LP', '2×LP', '3×LP', 'EP', '7"', '10"', '12"', 'Box Set'].map(
          (x): [string, string] => [x, x],
        ),
      },
      {
        key: 'editionType',
        label: 'Tipo de edición',
        options: [
          ['', '—'],
          ['original', '1ª edición'],
          ['reissue', 'Reedición'],
          ['remaster', 'Remaster'],
          ['limited', 'Limitada'],
          ['promo', 'Promo'],
          ['bootleg', 'Bootleg'],
          ['compilation', 'Compilado'],
          ['other', 'Otra'],
        ],
      },
      { key: 'condMedia', label: 'Cond. disco', options: COND },
      { key: 'condSleeve', label: 'Cond. portada', options: COND },
    ],
  },
  {
    n: '03',
    title: 'Compra',
    sub: 'Fecha, precio, moneda, lugar',
    fields: [
      { key: 'date', label: 'Fecha (AAAA-MM-DD)', half: true },
      { key: 'price', label: 'Precio pagado', ph: '45', half: true, numeric: true },
      {
        key: 'currency',
        label: 'Moneda',
        options: CURRENCIES.map((x): [string, string] => [x, x]),
      },
      { key: 'place', label: 'Lugar', ph: 'Disquería…' },
      { key: 'notes', label: 'Notas personales' },
    ],
  },
  {
    n: '04',
    title: 'Colección',
    sub: 'Ubicación física (privada) y tags',
    fields: [
      { key: 'location', label: 'Ubicación física', ph: 'Estante 3 · fila B' },
      { key: 'tags', label: 'Tags', ph: 'prog, favoritos' },
    ],
  },
];
const DRAFT = 'kz.draft.manual';

/** 1h — Agregar manualmente: secciones plegables y borrador guardado en el teléfono. */
export default function Manual() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const p = useLocalSearchParams<{
    destino?: string;
    artista?: string;
    titulo?: string;
    barcode?: string;
  }>();
  const toWishlist = p.destino === 'wishlist';
  const { data: profile } = useProfile();
  const [values, setValues] = useState<Values>(() => blank('USD'));
  const [open, setOpen] = useState<Record<string, boolean>>({ '01': true });
  const [restored, setRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const idem = useRef(`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT)
      .then((raw) => {
        const prefill = {
          artist: p.artista ?? '',
          title: p.titulo ?? '',
          barcode: p.barcode ?? '',
        };
        const draft = raw ? (JSON.parse(raw) as { values: Values; idem: string }) : null;
        if (draft && !prefill.artist && !prefill.title && !prefill.barcode) {
          setValues(draft.values);
          idem.current = draft.idem;
          setRestored(true);
        } else
          setValues((v) => ({
            ...v,
            ...Object.fromEntries(Object.entries(prefill).filter(([, x]) => x)),
          }));
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, [p.artista, p.titulo, p.barcode]);

  useEffect(() => {
    if (profile?.baseCurrency)
      setValues((v) => (v.price ? v : { ...v, currency: profile.baseCurrency }));
  }, [profile?.baseCurrency]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      const empty = !values.artist && !values.title && !values.tracklist;
      (empty
        ? AsyncStorage.removeItem(DRAFT)
        : AsyncStorage.setItem(DRAFT, JSON.stringify({ values, idem: idem.current }))
      ).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [values]);

  const tracks = useMemo(() => parseTracklist(values.tracklist).length, [values.tracklist]);
  const set = (k: FieldKey, v: string) => setValues((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!values.artist.trim() || !values.title.trim()) {
      setOpen((o) => ({ ...o, '01': true }));
      return setError('Completá al menos artista y título.');
    }
    setBusy(true);
    setError(null);
    try {
      if (toWishlist) {
        await api.wishlist.add({ manual: toInput(values).manual, priority: 2 }, idem.current);
        await AsyncStorage.removeItem(DRAFT);
        await invalidate();
        toast.show(`Sumaste ${values.title} a tu wishlist.`);
        return router.replace('/wishlist');
      }
      const res = await api.collection.add(toInput(values), idem.current);
      await AsyncStorage.removeItem(DRAFT);
      await invalidate();
      toast.show(`Agregaste ${values.title} a tu colección.`);
      toast.celebrate(res.unlockedAchievements);
      router.replace(`/coleccion/${res.item.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NETWORK'
          ? 'Sin conexión. El borrador queda guardado en el teléfono; guardalo cuando vuelvas a tener señal.'
          : errorMessage(e),
      );
      setBusy(false);
    }
  }

  const sections = toWishlist ? SECTIONS.slice(0, 2) : SECTIONS;
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlowBar
        left="Cancelar"
        onLeft={() => router.back()}
        title={toWishlist ? 'Sumar a la wishlist' : 'Nuevo vinilo'}
        right="Cámara"
        onRight={() => router.replace(toWishlist ? '/agregar?destino=wishlist' : '/agregar')}
      />
      {restored ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 8,
            backgroundColor: c.a100,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <T size={12} weight={600} color={c.a800}>
            Borrador recuperado del teléfono
          </T>
          <Pressable
            onPress={() => {
              setValues(blank(profile?.baseCurrency ?? 'USD'));
              setRestored(false);
              AsyncStorage.removeItem(DRAFT).catch(() => {});
            }}
          >
            <T size={12} weight={600} color={c.a800}>
              Descartar
            </T>
          </Pressable>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1, borderTopWidth: 2, borderTopColor: c.divider }}
        keyboardShouldPersistTaps="handled"
      >
        {sections.map((sec) => {
          const isOpen = !!open[sec.n];
          return (
            <View key={sec.n} style={{ borderBottomWidth: 2, borderBottomColor: c.divider }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                onPress={() => setOpen((o) => ({ ...o, [sec.n]: !o[sec.n] }))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                }}
              >
                <T size={12} weight={600} color={c.accent} style={{ width: 28, fontFamily: mono }}>
                  {sec.n}
                </T>
                <View style={{ flex: 1 }}>
                  <T size={17} weight={800}>
                    {sec.title}
                  </T>
                  <T size={12} muted>
                    {sec.n === '01' && tracks ? `${sec.sub} · ${tracks} temas` : sec.sub}
                  </T>
                </View>
                <T size={20} weight={600}>
                  {isOpen ? '−' : '+'}
                </T>
              </Pressable>
              {isOpen ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 12,
                    paddingHorizontal: 20,
                    paddingBottom: 20,
                  }}
                >
                  {sec.fields.map((f) =>
                    f.options ? (
                      <View key={f.key} style={{ width: '100%' }}>
                        <T size={12} color="rgba(32,30,29,0.7)" style={{ marginBottom: 5 }}>
                          {f.label}
                        </T>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {f.options.map(([v, l]) => (
                            <Chip
                              key={v || 'none'}
                              label={l}
                              on={values[f.key] === v}
                              onPress={() => set(f.key, v)}
                            />
                          ))}
                        </View>
                      </View>
                    ) : (
                      <Field
                        key={f.key}
                        style={{ width: f.half ? '47.5%' : '100%', flexGrow: f.half ? 1 : 0 }}
                        label={f.label}
                        placeholder={f.ph}
                        value={values[f.key]}
                        onChangeText={(t) => set(f.key, t)}
                        keyboardType={f.numeric ? 'decimal-pad' : 'default'}
                        multiline={f.multiline}
                        numberOfLines={f.multiline ? 4 : 1}
                        autoCapitalize={f.key === 'tags' ? 'none' : 'sentences'}
                      />
                    ),
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          borderTopWidth: 2,
          borderTopColor: c.divider,
          gap: 10,
        }}
      >
        {error ? (
          <T size={13} weight={600} color={c.a700} accessibilityRole="alert">
            {error}
          </T>
        ) : null}
        <Cta
          label={toWishlist ? 'Agregar a wishlist' : 'Guardar en colección'}
          end="✓"
          busy={busy}
          onPress={save}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
