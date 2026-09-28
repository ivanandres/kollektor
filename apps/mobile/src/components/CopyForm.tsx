import { CONDITIONS, parseAmount } from '@kollektor/app-logic';
import type { CollectionItemFields } from '@kollektor/schemas';
import { View } from 'react-native';
import { T } from './T';
import { Chip, Field, Segmented } from './ui';

export interface CopyValues {
  conditionMedia: string | null;
  conditionSleeve: string | null;
  purchasePrice: string;
  purchaseCurrency: string;
  purchaseDate: string;
  purchasePlace: string;
  notes: string;
  storageLocation: string;
  tags: string;
  copyNumber: string;
}

export const CURRENCIES = ['USD', 'ARS', 'EUR', 'GBP', 'BRL', 'CLP', 'UYU', 'MXN', 'JPY'];

export const emptyCopy = (currency: string): CopyValues => ({
  conditionMedia: null,
  conditionSleeve: null,
  purchasePrice: '',
  purchaseCurrency: currency,
  purchaseDate: new Date().toISOString().slice(0, 10),
  purchasePlace: '',
  notes: '',
  storageLocation: '',
  tags: '',
  copyNumber: '',
});

const text = (v: string) => (v.trim() ? v.trim() : null);

export function copyToFields(v: CopyValues): CollectionItemFields {
  const price = parseAmount(v.purchasePrice);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(v.purchaseDate.trim()) ? v.purchaseDate.trim() : null;
  return {
    conditionMedia: (v.conditionMedia as CollectionItemFields['conditionMedia']) ?? null,
    conditionSleeve: (v.conditionSleeve as CollectionItemFields['conditionSleeve']) ?? null,
    purchasePrice: price,
    purchaseCurrency: price != null ? v.purchaseCurrency : null,
    purchaseDate: date,
    purchasePlace: text(v.purchasePlace),
    notes: text(v.notes),
    storageLocation: text(v.storageLocation),
    copyNumber: text(v.copyNumber),
    tags: v.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

const COND = CONDITIONS.map((x): [string, string] => [x, x]);

/** Condición, compra y notas de la copia (1g paso Compra). `extended` suma ubicación, Nº y tags. */
export function CopyForm({
  value,
  onChange,
  extended,
}: {
  value: CopyValues;
  onChange: (v: CopyValues) => void;
  extended?: boolean;
}) {
  const set =
    <K extends keyof CopyValues>(k: K) =>
    (v: CopyValues[K]) =>
      onChange({ ...value, [k]: v });
  return (
    <View style={{ gap: 14 }}>
      <View>
        <T size={12} muted style={{ marginBottom: 6 }}>
          Condición del disco
        </T>
        <Segmented
          accent
          options={COND}
          value={value.conditionMedia}
          onChange={(v) => set('conditionMedia')(v === value.conditionMedia ? null : v)}
        />
      </View>
      <View>
        <T size={12} muted style={{ marginBottom: 6 }}>
          Condición de la portada
        </T>
        <Segmented
          accent
          options={COND}
          value={value.conditionSleeve}
          onChange={(v) => set('conditionSleeve')(v === value.conditionSleeve ? null : v)}
        />
      </View>
      <Field
        big
        label="Precio pagado"
        placeholder="0"
        keyboardType="decimal-pad"
        value={value.purchasePrice}
        onChangeText={set('purchasePrice')}
      />
      <View>
        <T size={12} muted style={{ marginBottom: 6 }}>
          Moneda
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[...new Set([value.purchaseCurrency, ...CURRENCIES])].map((cur) => (
            <Chip
              key={cur}
              label={cur}
              on={value.purchaseCurrency === cur}
              onPress={() => set('purchaseCurrency')(cur)}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field
          style={{ flex: 1 }}
          label="Fecha (AAAA-MM-DD)"
          value={value.purchaseDate}
          onChangeText={set('purchaseDate')}
        />
        <Field
          style={{ flex: 1 }}
          label="Dónde"
          placeholder="Disquería…"
          value={value.purchasePlace}
          onChangeText={set('purchasePlace')}
        />
      </View>
      <Field
        label="Notas"
        placeholder="Incluye posters y stickers"
        value={value.notes}
        onChangeText={set('notes')}
      />
      {extended ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Field
              style={{ flex: 1 }}
              label="Ubicación física (privada)"
              placeholder="Estante 3 · fila B"
              value={value.storageLocation}
              onChangeText={set('storageLocation')}
            />
            <Field
              style={{ flex: 1 }}
              label="Nº de copia"
              placeholder="245/500"
              value={value.copyNumber}
              onChangeText={set('copyNumber')}
            />
          </View>
          <Field
            label="Tags"
            placeholder="prog, favoritos"
            autoCapitalize="none"
            value={value.tags}
            onChangeText={set('tags')}
          />
        </>
      ) : null}
    </View>
  );
}
