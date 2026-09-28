import type { CollectionItem } from '@kollektor/api-client';
import { coverOf, editionLine } from '@kollektor/app-logic';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CopyForm, copyToFields, type CopyValues } from '@/components/CopyForm';
import { Cover } from '@/components/Cover';
import { FlowBar } from '@/components/FlowBar';
import { T } from '@/components/T';
import { useToast } from '@/components/Toast';
import { Cta, rule } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useInvalidateAll, useItem } from '@/lib/queries';
import { c } from '@/lib/theme';

export default function EditItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: item } = useItem(id);
  return item ? <Edit item={item} /> : <View style={{ flex: 1, backgroundColor: c.bg }} />;
}

const fromItem = (i: CollectionItem): CopyValues => ({
  conditionMedia: i.conditionMedia,
  conditionSleeve: i.conditionSleeve,
  purchasePrice: i.purchasePrice != null ? String(i.purchasePrice).replace('.', ',') : '',
  purchaseCurrency: i.purchaseCurrency ?? i.value.baseCurrency ?? 'USD',
  purchaseDate: i.purchaseDate ?? '',
  purchasePlace: i.purchasePlace ?? '',
  notes: i.notes ?? '',
  storageLocation: i.storageLocation ?? '',
  tags: i.tags.join(', '),
  copyNumber: i.copyNumber ?? '',
});

function Edit({ item }: { item: CollectionItem }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const invalidate = useInvalidateAll();
  const [values, setValues] = useState(() => fromItem(item));
  const [busy, setBusy] = useState(false);
  const r = item.release;

  async function save() {
    setBusy(true);
    try {
      const res = await api.collection.update(item.id, copyToFields(values));
      await invalidate();
      toast.celebrate(res.unlockedAchievements);
      router.back();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
      setBusy(false);
    }
  }

  function remove() {
    Alert.alert(
      '¿Sacar este disco de tu colección?',
      `${r.album.title} — ${r.album.artistDisplay}. Los logros que ya desbloqueaste se conservan.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.collection.remove(item.id);
              await invalidate();
              toast.show(`Sacaste ${r.album.title} de tu colección.`);
              router.dismissTo('/coleccion');
            } catch (e) {
              toast.show(errorMessage(e), 'error');
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FlowBar
        left="Cancelar"
        onLeft={() => router.back()}
        title="Editar vinilo"
        right="Borrar"
        onRight={remove}
      />
      <ScrollView
        style={{ borderTopWidth: 2, borderTopColor: c.divider }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[{ flexDirection: 'row', gap: 12, padding: 20, paddingVertical: 16 }, rule]}>
          <Cover url={coverOf(item)} size={72} stripe={5} />
          <View style={{ flex: 1 }}>
            <T size={16} weight={800} lh={19}>
              {r.album.title}
            </T>
            <T size={12} muted>
              {r.album.artistDisplay} · {editionLine(r.country, r.releaseYear, r.editionType)}
            </T>
          </View>
        </View>
        <View style={{ padding: 20 }}>
          <CopyForm value={values} onChange={setValues} extended />
        </View>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          borderTopWidth: 2,
          borderTopColor: c.divider,
        }}
      >
        <Cta label="Guardar cambios" end="✓" onPress={save} busy={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}
