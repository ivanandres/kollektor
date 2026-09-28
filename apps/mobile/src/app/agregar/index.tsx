import type { ExternalCandidate, IdentifyResult } from '@kollektor/api-client';
import { countryEs, money } from '@kollektor/app-logic';
import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CopyForm, copyToFields, emptyCopy, type CopyValues } from '@/components/CopyForm';
import { Cover } from '@/components/Cover';
import { FlowBar } from '@/components/FlowBar';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { Cta, hair, rule } from '@/components/ui';
import { api, ApiError, errorMessage } from '@/lib/api';
import { toIdentifyImage } from '@/lib/image';
import { useInvalidateAll, useProfile } from '@/lib/queries';
import { c, font, mono } from '@/lib/theme';

type Source =
  | { kind: 'photo'; hints: IdentifyResult['hints']; remaining: number | null }
  | { kind: 'barcode'; barcode: string }
  | { kind: 'text'; q: string }
  | { kind: 'versions'; title: string };

const STEPS = ['Foto', 'Edición', 'Compra'] as const;

/** 1g — Identificar con cámara: Foto → Edición → Compra. */
export default function AddFlow() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{
    q?: string;
    destino?: string;
    wishlist?: string;
    album?: string;
    titulo?: string;
    vincular?: string;
  }>();
  const toWishlist = p.destino === 'wishlist';
  const [step, setStep] = useState<0 | 1 | 2>(p.q || p.album ? 1 : 0);
  const [source, setSource] = useState<Source | null>(null);
  const [cands, setCands] = useState<ExternalCandidate[]>([]);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(
    src: Source,
    fn: () => Promise<{ items?: ExternalCandidate[]; candidates?: ExternalCandidate[] }>,
    label: string,
  ) {
    setError(null);
    setBusy(label);
    setSource(src);
    try {
      const res = await fn();
      setCands(res.items ?? res.candidates ?? []);
      setSel(0);
      setStep(1);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NOT_CONFIGURED'
          ? 'Esta búsqueda no está disponible todavía. Probá con otra opción o cargalo a mano.'
          : errorMessage(e),
      );
    } finally {
      setBusy(null);
    }
  }
  const runText = (q: string) =>
    load(
      { kind: 'text', q },
      () => api.catalog.searchExternal({ q, type: 'release', perPage: 25 }),
      'Buscando en Discogs…',
    );
  const runBarcode = (barcode: string) =>
    load(
      { kind: 'barcode', barcode },
      () => api.catalog.identifyBarcode(barcode),
      'Buscando el código…',
    );
  const runPhoto = async (images: { data: string; mediaType: 'image/jpeg' }[]) => {
    setError(null);
    setBusy('Identificando…');
    try {
      const res = await api.catalog.identifyPhoto(images);
      setSource({ kind: 'photo', hints: res.hints, remaining: res.remainingToday });
      setCands(res.candidates);
      setSel(0);
      setStep(1);
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'NOT_CONFIGURED'
          ? 'El reconocimiento por foto no está disponible. Probá con el código de barras o buscá por texto.'
          : errorMessage(e),
      );
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (p.album)
      void load(
        { kind: 'versions', title: p.titulo ?? 'Este álbum' },
        () => api.catalog.albumExternalVersions(p.album!),
        'Buscando ediciones…',
      );
    else if (p.q) void runText(p.q);
    // deep links run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = cands[sel];
  const title = p.vincular
    ? 'Vincular con Discogs'
    : toWishlist
      ? 'Sumar a la wishlist'
      : 'Agregar vinilo';
  const back = () =>
    step === 0 ? router.back() : (setStep((s) => (s - 1) as 0 | 1), setError(null));

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlowBar
        left={step ? '← Atrás' : 'Cerrar'}
        onLeft={back}
        title={title}
        right="Manual"
        onRight={() =>
          router.replace(toWishlist ? '/agregar/manual?destino=wishlist' : '/agregar/manual')
        }
      />
      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 2,
          borderBottomWidth: 2,
          borderColor: c.divider,
        }}
      >
        {STEPS.map((label, i) => {
          const bg = i === step ? c.accent : i < step ? c.surface : 'transparent';
          const fg = i === step ? c.bg : i < step ? c.text : c.n600;
          return (
            <Pressable
              key={label}
              disabled={i >= step}
              onPress={() => setStep(i as 0 | 1)}
              style={{
                flex: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: bg,
                borderLeftWidth: i ? 1 : 0,
                borderLeftColor: c.divider,
              }}
            >
              <T size={12} weight={600} color={fg}>
                0{i + 1} {label}
              </T>
            </Pressable>
          );
        })}
      </View>
      {step === 0 ? (
        <PhotoStep
          busy={busy}
          error={error}
          onPhotos={runPhoto}
          onBarcode={runBarcode}
          onText={runText}
        />
      ) : step === 1 ? (
        <EditionStep
          source={source}
          cands={cands}
          sel={sel}
          onSelect={setSel}
          busy={busy}
          error={error}
          toWishlist={toWishlist}
          linkItemId={p.vincular ?? null}
          onVersions={(cand) =>
            cand.masterId &&
            load(
              { kind: 'versions', title: [cand.artist, cand.title].filter(Boolean).join(' — ') },
              () => api.catalog.masterVersions(cand.masterId!),
              'Buscando ediciones…',
            )
          }
          onNext={() => setStep(2)}
        />
      ) : chosen ? (
        <PurchaseStep cand={chosen} wishlistId={p.wishlist ?? null} />
      ) : null}
      <View style={{ height: insets.bottom }} />
    </KeyboardAvoidingView>
  );
}

// ─── 01 Foto ───

function PhotoStep({
  busy,
  error,
  onPhotos,
  onBarcode,
  onText,
}: {
  busy: string | null;
  error: string | null;
  onPhotos: (i: { data: string; mediaType: 'image/jpeg' }[]) => void;
  onBarcode: (code: string) => void;
  onText: (q: string) => void;
}) {
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [mode, setMode] = useState<'photo' | 'barcode' | 'text'>('photo');
  const [typed, setTyped] = useState('');
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) void requestPerm();
  }, [perm, requestPerm]);
  useEffect(() => {
    if (mode !== 'barcode') tried.current.clear();
  }, [mode]);

  const onScan = (r: BarcodeScanningResult) => {
    if (busy || tried.current.has(r.data)) return;
    tried.current.add(r.data);
    onBarcode(r.data);
  };

  async function shoot() {
    if (!perm?.granted || !camera.current) return pick();
    const photo = await camera.current.takePictureAsync({ quality: 0.8, skipProcessing: false });
    if (photo) onPhotos([await toIdentifyImage(photo.uri, photo.width, photo.height)]);
  }

  async function pick() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.9,
    });
    if (res.canceled) return;
    onPhotos(await Promise.all(res.assets.map((a) => toIdentifyImage(a.uri, a.width, a.height))));
  }

  const live = !!perm?.granted;
  const hint =
    mode === 'barcode'
      ? 'Apuntá al código de barras del dorso. Lo leemos solos.'
      : mode === 'text'
        ? 'Buscá por artista, título, sello o número de catálogo.'
        : 'Encuadrá la portada. También podés fotografiar la etiqueta o el back cover para afinar la edición.';

  return (
    <View style={{ flex: 1, backgroundColor: c.text }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#2d2b2b',
          overflow: 'hidden',
        }}
      >
        {live ? (
          <CameraView
            ref={camera}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={mode === 'barcode' && !busy ? onScan : undefined}
          />
        ) : null}
        <View
          style={{
            width: 280,
            maxWidth: '76%',
            height: mode === 'barcode' ? 140 : 280,
            borderWidth: 2,
            borderColor: c.bg,
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: -2,
              top: -2,
              width: 28,
              height: 28,
              borderLeftWidth: 5,
              borderTopWidth: 5,
              borderColor: c.accent,
            }}
          />
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 28,
              height: 28,
              borderRightWidth: 5,
              borderBottomWidth: 5,
              borderColor: c.accent,
            }}
          />
        </View>
        <T
          size={11}
          color={c.bg}
          style={{ position: 'absolute', left: 20, bottom: 16, fontFamily: mono, opacity: 0.7 }}
        >
          {busy ??
            (live
              ? mode === 'barcode'
                ? 'buscando código…'
                : ''
              : perm && !perm.canAskAgain
                ? 'sin permiso de cámara · subí una foto'
                : 'visor de cámara')}
        </T>
        {busy ? <ActivityIndicator color={c.bg} style={{ position: 'absolute' }} /> : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingVertical: 14, gap: 8 }}>
        <T size={13} color={c.bg}>
          {hint}
        </T>
        {mode === 'text' || (mode === 'barcode' && !live) ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              autoFocus
              value={typed}
              onChangeText={setTyped}
              placeholder={mode === 'text' ? 'Pink Floyd Meddle' : '7 798141 234567'}
              placeholderTextColor={c.n500}
              keyboardType={mode === 'barcode' ? 'number-pad' : 'default'}
              returnKeyType="search"
              onSubmitEditing={() =>
                typed.trim() &&
                (mode === 'text' ? onText(typed.trim()) : onBarcode(typed.replace(/\D/g, '')))
              }
              style={{
                flex: 1,
                minHeight: 44,
                paddingHorizontal: 10,
                backgroundColor: c.bg,
                color: c.text,
                fontFamily: font(400),
                fontSize: 16,
              }}
            />
            <Pressable
              onPress={() =>
                typed.trim() &&
                (mode === 'text' ? onText(typed.trim()) : onBarcode(typed.replace(/\D/g, '')))
              }
              style={{ backgroundColor: c.accent, paddingHorizontal: 14, justifyContent: 'center' }}
            >
              <T size={14} weight={800} color={c.bg}>
                Buscar
              </T>
            </Pressable>
          </View>
        ) : null}
        {error ? (
          <T size={13} weight={600} color={c.a400} accessibilityRole="alert">
            {error}
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {mode !== 'photo' ? (
            <Pressable onPress={() => setMode('photo')}>
              <T size={12} color={c.bg} style={{ opacity: 0.8 }}>
                ← Foto de la portada
              </T>
            </Pressable>
          ) : null}
          {mode !== 'text' ? (
            <Pressable onPress={() => (setMode('text'), setTyped(''))}>
              <T size={12} color={c.bg} style={{ opacity: 0.8, textDecorationLine: 'underline' }}>
                Buscar por texto
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 28,
        }}
      >
        <Pressable style={{ flex: 1 }} disabled={!!busy} onPress={pick}>
          <T size={13} weight={600} color={c.bg}>
            Subir foto
          </T>
        </Pressable>
        <Pressable
          accessibilityLabel="Sacar foto"
          disabled={!!busy}
          onPress={shoot}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            borderWidth: 4,
            borderColor: c.bg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              backgroundColor: c.accent,
              opacity: busy ? 0.5 : 1,
            }}
          />
        </Pressable>
        <Pressable
          style={{ flex: 1, alignItems: 'flex-end' }}
          disabled={!!busy}
          onPress={() => (setMode(mode === 'barcode' ? 'photo' : 'barcode'), setTyped(''))}
        >
          <T size={13} weight={600} color={c.bg}>
            {mode === 'barcode' ? 'Portada' : 'Barcode'}
          </T>
        </Pressable>
      </View>
    </View>
  );
}

// ─── 02 Edición ───

function note(cand: ExternalCandidate) {
  if (cand.ownedCopies > 0)
    return {
      text:
        cand.ownedCopies === 1
          ? 'Ya tenés esta edición'
          : `Ya tenés ${cand.ownedCopies} copias de esta edición`,
      strong: true,
    };
  if (cand.ownedEditionsOfAlbum > 0)
    return { text: 'Tenés otra edición de este álbum', strong: false };
  if (cand.inWishlist) return { text: 'Está en tu wishlist', strong: false };
  return null;
}

function EditionStep({
  source,
  cands,
  sel,
  onSelect,
  busy,
  error,
  toWishlist,
  linkItemId,
  onVersions,
  onNext,
}: {
  source: Source | null;
  cands: ExternalCandidate[];
  sel: number;
  onSelect: (i: number) => void;
  busy: string | null;
  error: string | null;
  toWishlist: boolean;
  linkItemId: string | null;
  onVersions: (c: ExternalCandidate) => unknown;
  onNext: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const [acting, setActing] = useState(false);
  const chosen = cands[sel];
  const mixed = new Set(cands.map((x) => `${x.artist}|${x.title}`)).size > 1;
  const head =
    source?.kind === 'photo'
      ? {
          k: 'Identificado',
          t: [source.hints?.artist, source.hints?.title].filter(Boolean).join(' — ') || 'Foto',
        }
      : source?.kind === 'barcode'
        ? { k: 'Código de barras', t: source.barcode }
        : source?.kind === 'versions'
          ? { k: 'Todas las ediciones', t: source.title }
          : { k: 'Búsqueda', t: source?.kind === 'text' ? source.q : '' };

  async function act(fn: () => Promise<unknown>, done: string, to: string) {
    setActing(true);
    try {
      const res = (await fn()) as { unlockedAchievements?: [] } | undefined;
      await invalidate();
      toast.show(done);
      if (res?.unlockedAchievements) toast.celebrate(res.unlockedAchievements);
      router.replace(to as '/wishlist');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setActing(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }}>
        <View style={[{ paddingHorizontal: 20, paddingVertical: 16 }, rule]}>
          <T kicker color={c.a700}>
            {head.k}
          </T>
          <T size={24} weight={800} lh={26.4} style={{ marginTop: 4 }}>
            {head.t}
          </T>
          <T size={13} muted style={{ marginTop: 6 }}>
            {busy ??
              (cands.length === 0
                ? 'No encontramos ediciones en Discogs. Probá otra foto, el código de barras o cargalo a mano.'
                : `Encontramos ${cands.length} ${cands.length === 1 ? 'edición posible' : 'ediciones posibles'} en Discogs. Elegí la tuya: mirá sello y catálogo en la etiqueta.`)}
            {source?.kind === 'photo' && source.remaining != null && source.remaining <= 5
              ? ` Te quedan ${source.remaining} identificaciones por foto hoy.`
              : ''}
          </T>
          {error ? (
            <T size={13} weight={600} color={c.a700} style={{ marginTop: 6 }}>
              {error}
            </T>
          ) : null}
        </View>
        {cands.map((x, i) => {
          const on = i === sel;
          const n = note(x);
          return (
            <Pressable
              key={`${x.type}-${x.externalId}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onSelect(i)}
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  backgroundColor: on ? c.a100 : 'transparent',
                },
                hair,
              ]}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  borderWidth: 1.5,
                  borderColor: c.divider,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on ? (
                  <View
                    style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.accent }}
                  />
                ) : null}
              </View>
              <Cover url={x.thumbUrl ?? x.coverUrl} size={64} stripe={5} />
              <View style={{ flex: 1 }}>
                {mixed ? (
                  <T size={12} weight={600}>
                    {[x.artist, x.title].filter(Boolean).join(' — ')}
                  </T>
                ) : null}
                <T size={14} weight={700}>
                  {[countryEs(x.country), x.year, x.labels[0]].filter(Boolean).join(' · ') ||
                    x.title}
                </T>
                <T size={12} muted>
                  {[x.catalogNumber ? `Cat. ${x.catalogNumber}` : null, x.formats.join(', ')]
                    .filter(Boolean)
                    .join(' · ')}
                </T>
                {n ? (
                  <T
                    size={12}
                    weight={n.strong ? 600 : 400}
                    color={n.strong ? c.a700 : c.text}
                    style={{ marginTop: 2 }}
                  >
                    {n.text}
                  </T>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        <View style={{ padding: 20, paddingVertical: 14, gap: 10 }}>
          {chosen?.masterId && source?.kind !== 'versions' ? (
            <Pressable onPress={() => onVersions(chosen)}>
              <T size={13} weight={600} color={c.a700}>
                Ver todas las ediciones de este álbum →
              </T>
            </Pressable>
          ) : null}
          {!linkItemId ? (
            <Pressable
              onPress={() =>
                router.replace(toWishlist ? '/agregar/manual?destino=wishlist' : '/agregar/manual')
              }
            >
              <T size={13} color={c.accent} style={{ textDecorationLine: 'underline' }}>
                No es ninguna — cargar manualmente
              </T>
            </Pressable>
          ) : null}
          {cands.length ? (
            <T size={11} muted>
              Datos provistos por Discogs
            </T>
          ) : null}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
        {linkItemId ? (
          <Cta
            label="Vincular con esta edición"
            disabled={!chosen}
            busy={acting}
            onPress={() =>
              chosen &&
              act(
                () =>
                  api.collection.link(linkItemId, { discogsReleaseId: Number(chosen.externalId) }),
                'Listo: tu disco ahora tiene los datos de Discogs.',
                `/coleccion/${linkItemId}`,
              )
            }
          />
        ) : toWishlist ? (
          <Cta
            label="Agregar a wishlist"
            disabled={!chosen}
            busy={acting}
            onPress={() =>
              chosen &&
              act(
                () =>
                  api.wishlist.add({ discogsReleaseId: Number(chosen.externalId), priority: 2 }),
                `Sumaste ${chosen.title} a tu wishlist.`,
                '/wishlist',
              )
            }
          />
        ) : (
          <Cta label="Usar esta edición" disabled={!chosen} onPress={onNext} />
        )}
      </View>
    </View>
  );
}

// ─── 03 Compra ───

function PurchaseStep({
  cand,
  wishlistId,
}: {
  cand: ExternalCandidate;
  wishlistId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const { data: profile } = useProfile();
  const [values, setValues] = useState<CopyValues>(() => emptyCopy(profile?.baseCurrency ?? 'USD'));
  const [busy, setBusy] = useState(false);
  // One key per chosen edition: a retry after a bad connection never duplicates the record.
  const idem = useMemo(
    () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`,
    [],
  );
  const { data: preview } = useQuery({
    queryKey: ['externalRelease', cand.externalId],
    queryFn: () => api.catalog.externalRelease(cand.externalId),
    staleTime: Infinity,
  });

  async function save() {
    setBusy(true);
    try {
      const fields = { discogsReleaseId: Number(cand.externalId), ...copyToFields(values) };
      const res = wishlistId
        ? await api.wishlist.purchase(wishlistId, fields)
        : await api.collection.add(fields, idem);
      await invalidate();
      toast.show(`Agregaste ${cand.title} a tu colección.`);
      toast.celebrate(res.unlockedAchievements);
      router.replace(`/coleccion/${res.item.id}`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[{ flexDirection: 'row', gap: 12, padding: 20, paddingVertical: 16 }, rule]}>
          <Cover
            url={preview?.images[0]?.url ?? cand.coverUrl ?? cand.thumbUrl}
            size={72}
            stripe={5}
          />
          <View style={{ flex: 1 }}>
            <T size={16} weight={800} lh={19}>
              {cand.title}
            </T>
            <T size={12} muted>
              {[countryEs(cand.country), cand.year, cand.labels[0], cand.catalogNumber]
                .filter(Boolean)
                .join(' · ')}
            </T>
            <T size={11} weight={600} color={c.a700} style={{ marginTop: 4 }}>
              Datos importados de Discogs
              {preview?.tracklist.length ? ` · ${preview.tracklist.length} temas` : ''}
            </T>
          </View>
        </View>
        <View style={{ padding: 20, gap: 14 }}>
          <CopyForm value={values} onChange={setValues} />
          {preview?.lowestPrice ? (
            <View
              style={{ backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 10 }}
            >
              <T size={12}>
                Valor de referencia de esta edición:{' '}
                <T size={12} weight={700}>
                  desde {money(preview.lowestPrice.amount, preview.lowestPrice.currency)}
                </T>{' '}
                · Discogs Marketplace.
              </T>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}>
        <Cta label="Guardar en colección" end="✓" busy={busy} onPress={save} />
      </View>
    </View>
  );
}
