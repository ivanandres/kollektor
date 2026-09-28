import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { c, mono } from '@/lib/theme';
import { T } from './T';

let seq = 0;

/** Album cover, or the mockups' striped placeholder (135°, neutral-200/300). */
export function Cover({
  url,
  size,
  stripe = 7,
  label,
  style,
  children,
}: {
  url?: string | null;
  /** Fixed size; omit to fill the width at 1:1. */
  size?: number;
  stripe?: number;
  label?: string | null;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const box: ViewStyle =
    size != null ? { width: size, height: size } : { width: '100%', aspectRatio: 1 };
  const id = `stripes${++seq}`;
  return (
    <View style={[box, { backgroundColor: c.n200, overflow: 'hidden' }, style]}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <>
          <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
            <Defs>
              <Pattern
                id={id}
                patternUnits="userSpaceOnUse"
                width={stripe + 1}
                height={stripe + 1}
                patternTransform="rotate(45)"
              >
                <Rect width={stripe + 1} height={stripe + 1} fill={c.n200} />
                <Line x1={0} y1={0} x2={0} y2={stripe + 1} stroke={c.n300} strokeWidth={2} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
          {label ? (
            <T
              style={{ position: 'absolute', left: 6, bottom: 6, fontFamily: mono, fontSize: 10 }}
              muted
            >
              {label}
            </T>
          ) : null}
        </>
      )}
      {children}
    </View>
  );
}

export function CondBadge({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        position: 'absolute',
        right: 6,
        bottom: 6,
        backgroundColor: c.bg,
        paddingHorizontal: 4,
        paddingVertical: 1,
      }}
    >
      <T size={10} weight={600}>
        {children}
      </T>
    </View>
  );
}
