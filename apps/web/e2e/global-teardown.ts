import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The e2e build (distDir .next-e2e) rewrites next-env.d.ts; point it back at .next. */
export default function globalTeardown() {
  const file = fileURLToPath(new URL('../next-env.d.ts', import.meta.url));
  const src = readFileSync(file, 'utf8');
  const fixed = src.replaceAll('./.next-e2e/', './.next/');
  if (fixed !== src) writeFileSync(file, fixed);
}
