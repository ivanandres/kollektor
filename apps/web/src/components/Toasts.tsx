'use client';

import type { UnlockedAchievement } from '@kollektor/api-client';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface Toast {
  id: number;
  kind: 'info' | 'achievement' | 'error';
  text: string;
}

interface ToastApi {
  show: (text: string, kind?: Toast['kind']) => void;
  /** "Desbloqueaste «50 discos»" — the moment to celebrate after adding a record. */
  celebrate: (unlocked: UnlockedAchievement[]) => void;
}

const Ctx = createContext<ToastApi>({ show: () => {}, celebrate: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const show = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === 'achievement' ? 6000 : 3500,
    );
  }, []);

  const celebrate = useCallback(
    (unlocked: UnlockedAchievement[]) =>
      unlocked.forEach((a) => show(`Desbloqueaste «${a.name}». ${a.description}`, 'achievement')),
    [show],
  );

  const value = useMemo(() => ({ show, celebrate }), [show, celebrate]);
  const current = toasts[0];
  return (
    <Ctx.Provider value={value}>
      {children}
      {current ? (
        <div className="toast" data-kind={current.kind} role="status">
          <span>{current.text}</span>
          <button
            type="button"
            className="row-btn"
            style={{ width: 'auto', fontWeight: 800 }}
            aria-label="Cerrar"
            onClick={() => setToasts((t) => t.slice(1))}
          >
            ×
          </button>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
