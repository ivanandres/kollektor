'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { parseAmount } from '@/lib/amount';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
};

/** Amount filter input: keeps what the user types ("12," / "12.5") and commits it debounced. */
export function NumberInput({ value, onCommit, ...rest }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const last = useRef(value);

  // Follow outside changes (e.g. "Limpiar todo") without clobbering what is being typed.
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value == null ? '' : String(value));
    }
  }, [value]);

  useEffect(() => {
    const parsed = parseAmount(text) ?? undefined;
    if (parsed === last.current) return;
    const t = setTimeout(() => {
      last.current = parsed;
      commit.current(parsed);
    }, 400);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <input
      {...rest}
      inputMode="decimal"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
    />
  );
}
