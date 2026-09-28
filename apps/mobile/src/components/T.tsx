import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { c, font } from '@/lib/theme';

type Props = TextProps & {
  children?: ReactNode;
  size?: number;
  weight?: 400 | 600 | 700 | 800;
  color?: string;
  /** Section labels: 11px/600, .1em tracking, uppercase. */
  kicker?: boolean;
  muted?: boolean;
  lh?: number;
  ls?: number;
  style?: StyleProp<TextStyle>;
};

/** Text in Archivo with the design system's defaults (15px body, ink color). */
export function T({
  size = 15,
  weight = 400,
  color,
  kicker,
  muted,
  lh,
  ls,
  style,
  ...rest
}: Props) {
  const s: TextStyle = kicker
    ? {
        fontFamily: font(600),
        fontSize: 11,
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: color ?? c.text,
      }
    : {
        fontFamily: font(weight),
        fontSize: size,
        color: color ?? (muted ? c.n700 : c.text),
        ...(lh ? { lineHeight: lh } : {}),
        ...(ls != null ? { letterSpacing: ls } : {}),
      };
  return <Text {...rest} style={[s, style]} />;
}
