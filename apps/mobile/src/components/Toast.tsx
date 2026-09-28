import type { UnlockedAchievement } from '@kollektor/api-client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '@/lib/theme';
import { T } from './T';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'achievement' | 'error';
}
const Ctx = createContext({
  show: (_t: string, _k?: Toast['kind']) => {},
  celebrate: (_u: UnlockedAchievement[]) => {},
});
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const insets = useSafeAreaInsets();
  const show = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq;
    setList((l) => [...l, { id, text, kind }]);
    setTimeout(
      () => setList((l) => l.filter((t) => t.id !== id)),
      kind === 'achievement' ? 6000 : 3500,
    );
  }, []);
  const celebrate = useCallback(
    (u: UnlockedAchievement[]) =>
      u.forEach((a) => show(`Desbloqueaste «${a.name}». ${a.description}`, 'achievement')),
    [show],
  );
  const value = useMemo(() => ({ show, celebrate }), [show, celebrate]);
  const t = list[0];
  return (
    <Ctx.Provider value={value}>
      {children}
      {t ? (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 80 }}
        >
          <Pressable
            accessibilityRole="alert"
            onPress={() => setList((l) => l.slice(1))}
            style={{ backgroundColor: t.kind === 'achievement' ? c.accent : c.text, padding: 14 }}
          >
            <T size={14} color={c.bg}>
              {t.text}
            </T>
          </Pressable>
        </View>
      ) : null}
    </Ctx.Provider>
  );
}
