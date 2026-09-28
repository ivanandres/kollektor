import {
  chipGroups,
  clearFilters,
  isOn,
  num,
  parseAmount,
  SORT_LABEL,
  toggleValue,
  type CollectionFilters,
  type Sort,
} from '@kollektor/app-logic';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFacets } from '@/lib/queries';
import { c } from '@/lib/theme';
import { Sheet } from './Sheet';
import { T } from './T';
import { Chip, Cta, Field } from './ui';

const MAX = 8;

/** "Filtros" sheet (1f): chip groups from the facets, order, paid range, "Ver N vinilos". */
export function FilterSheet({
  open,
  value,
  onChange,
  count,
  currency,
  onClose,
}: {
  open: boolean;
  value: CollectionFilters;
  onChange: (f: CollectionFilters) => void;
  count: number | undefined;
  currency: string;
  onClose: () => void;
}) {
  const { data: facets } = useFacets();
  const [all, setAll] = useState<Record<string, boolean>>({});
  const [paid, setPaid] = useState({
    min: value.paidMin?.toString() ?? '',
    max: value.paidMax?.toString() ?? '',
  });
  return (
    <Sheet open={open} onClose={onClose} label="Filtros">
      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <T size={20} weight={800}>
          Filtros
        </T>
        <Pressable
          onPress={() => {
            setPaid({ min: '', max: '' });
            onChange(clearFilters(value));
          }}
        >
          <T size={13} weight={600} color={c.a700}>
            Limpiar todo
          </T>
        </Pressable>
      </View>
      {chipGroups(facets).map((g) =>
        g.options.length ? (
          <View key={g.key}>
            <T kicker style={{ marginBottom: 6 }}>
              {g.name}
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(all[g.key] ? g.options : g.options.slice(0, MAX)).map((o) => (
                <Chip
                  key={String(o.value)}
                  big
                  tone="accentOn"
                  label={o.label}
                  on={isOn(value, g.key, o.value)}
                  onPress={() => onChange(toggleValue(value, g.key, o.value))}
                />
              ))}
              {g.options.length > MAX && !all[g.key] ? (
                <Chip
                  big
                  label={`+${g.options.length - MAX}`}
                  onPress={() => setAll((x) => ({ ...x, [g.key]: true }))}
                />
              ) : null}
            </View>
          </View>
        ) : null,
      )}
      <View>
        <T kicker style={{ marginBottom: 6 }}>
          Orden
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
            <Chip
              key={k}
              big
              label={SORT_LABEL[k]}
              on={(value.sort ?? 'added_desc') === k}
              onPress={() => onChange({ ...value, sort: k })}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field
          style={{ flex: 1 }}
          label="Pagado desde"
          placeholder={`${currency} 0`}
          keyboardType="decimal-pad"
          value={paid.min}
          onChangeText={(t) => setPaid((p) => ({ ...p, min: t }))}
          onEndEditing={() => onChange({ ...value, paidMin: parseAmount(paid.min) ?? undefined })}
        />
        <Field
          style={{ flex: 1 }}
          label="hasta"
          placeholder={`${currency} ${facets?.ranges.paid?.max ? num(facets.ranges.paid.max) : 200}`}
          keyboardType="decimal-pad"
          value={paid.max}
          onChangeText={(t) => setPaid((p) => ({ ...p, max: t }))}
          onEndEditing={() => onChange({ ...value, paidMax: parseAmount(paid.max) ?? undefined })}
        />
      </View>
      <Cta
        label={`Ver ${count == null ? '…' : num(count)} ${count === 1 ? 'vinilo' : 'vinilos'}`}
        onPress={() => {
          onChange({
            ...value,
            paidMin: parseAmount(paid.min) ?? undefined,
            paidMax: parseAmount(paid.max) ?? undefined,
          });
          onClose();
        }}
      />
    </Sheet>
  );
}
