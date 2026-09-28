import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { c, font } from '@/lib/theme';
import { T } from './T';

/** 2px rule between sections. */
export const rule: ViewStyle = { borderBottomWidth: 2, borderBottomColor: c.divider };
export const hair: ViewStyle = { borderBottomWidth: 1, borderBottomColor: c.divider };

/** Full-width primary action with the arrow at the far end (52px, like every CTA in the mockups). */
export function Cta({
  label,
  end = '→',
  onPress,
  disabled,
  busy,
  variant = 'primary',
  style,
}: {
  label: string;
  end?: string;
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 52,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: primary
            ? pressed
              ? c.a600
              : c.accent
            : pressed
              ? c.surface
              : 'transparent',
          borderWidth: primary ? 0 : 1,
          borderColor: c.divider,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      <T size={15} weight={800} color={primary ? c.bg : c.text}>
        {label}
      </T>
      {busy ? (
        <ActivityIndicator color={primary ? c.bg : c.text} />
      ) : (
        <T size={15} weight={800} color={primary ? c.bg : c.text}>
          {end}
        </T>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  on,
  tone = 'plain',
  onPress,
  big,
}: {
  label: string;
  on?: boolean;
  tone?: 'plain' | 'solid' | 'accent' | 'accentOn';
  onPress?: () => void;
  big?: boolean;
}) {
  const bg =
    tone === 'solid' || (tone === 'plain' && on)
      ? c.text
      : tone === 'accent'
        ? c.a100
        : tone === 'accentOn' && on
          ? c.accent
          : 'transparent';
  const fg =
    tone === 'solid' || (tone === 'plain' && on) || (tone === 'accentOn' && on)
      ? c.bg
      : tone === 'accent'
        ? c.a800
        : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      onPress={onPress}
      style={{
        paddingHorizontal: big ? 12 : 10,
        paddingVertical: big ? 8 : 6,
        backgroundColor: bg,
        borderWidth: tone === 'accent' ? 0 : 1,
        borderColor: tone === 'solid' ? c.text : c.divider,
      }}
    >
      <T size={big ? 13 : 12} weight={tone === 'solid' ? 600 : 400} color={fg}>
        {label}
      </T>
    </Pressable>
  );
}

/** Label + input like the design system's `.field` / `.input`. */
export function Field({
  label,
  style,
  big,
  ...input
}: TextInputProps & { label: string; big?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <T size={12} color="rgba(32,30,29,0.7)" style={{ marginBottom: 5 }}>
        {label}
      </T>
      <TextInput
        placeholderTextColor={c.n600}
        {...input}
        style={{
          minHeight: 48,
          paddingHorizontal: 10,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.divider,
          color: c.text,
          fontFamily: font(big ? 700 : 400),
          fontSize: big ? 18 : 15,
        }}
      />
    </View>
  );
}

/** Segmented control: equal cells, the active one filled. */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  accent,
}: {
  options: [V, string][];
  value: V | null;
  onChange: (v: V) => void;
  accent?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.divider }}>
      {options.map(([v, l], i) => {
        const on = v === value;
        return (
          <Pressable
            key={String(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(v)}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: 'center',
              borderLeftWidth: i ? 1 : 0,
              borderLeftColor: c.divider,
              backgroundColor: on ? (accent ? c.accent : c.text) : 'transparent',
            }}
          >
            <T size={13} weight={600} color={on ? c.bg : c.text}>
              {l}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 28 }}>
      <T size={14} muted>
        {children}
      </T>
    </View>
  );
}
