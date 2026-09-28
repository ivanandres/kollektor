import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '@/lib/theme';
import { T } from './T';

/** Top bar of full-screen flows: "Cancelar | Título | acción". */
export function FlowBar({
  left,
  onLeft,
  title,
  right,
  onRight,
}: {
  left: string;
  onLeft: () => void;
  title: string;
  right?: ReactNode;
  onRight?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 4,
        paddingHorizontal: 20,
        paddingBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: c.bg,
      }}
    >
      <Pressable onPress={onLeft} hitSlop={8}>
        <T size={14} weight={600}>
          {left}
        </T>
      </Pressable>
      <T size={14} weight={800}>
        {title}
      </T>
      <Pressable
        onPress={onRight}
        disabled={!onRight}
        hitSlop={8}
        style={{ minWidth: 50, alignItems: 'flex-end' }}
      >
        {typeof right === 'string' ? (
          <T size={13} muted>
            {right}
          </T>
        ) : (
          right
        )}
      </Pressable>
    </View>
  );
}
