# Kollektor — notas para agentes

- Monorepo pnpm + Turborepo, TypeScript estricto (TS 6), ESM. Idioma de producto y mensajes de error: español (rioplatense).
- Capas: `apps/api` (Hono + Better Auth, solo HTTP) → `packages/core` (dominio, puertos en `src/ports.ts`) → `packages/integrations` (adaptadores externos) / `packages/db` (Drizzle). La lógica de negocio va en `packages/core/src/modules/*`, nunca en rutas.
- No importar `drizzle-orm` desde `apps/api` (hay dos copias por un peer de better-auth); exponer lo necesario desde el core.
- Validación de entrada: Zod en `packages/schemas` (compartido con web/mobile).
- Errores de dominio: `DomainError(code, mensaje en español)`; la API los mapea a HTTP en `apps/api/src/lib/http.ts`.
- Todo lo del usuario se filtra por `user_id`; filas de catálogo con `created_by_user_id` son privadas de su creador (`visibleTo`). Campos privados que nunca se publican: `purchase_place`, `storage_location`.
- SQL crudo con `sql\`\``: parámetros de fecha como ISO string con `::timestamptz`; arrays con `ARRAY[...]`.

## Web (`apps/web`)

- Next 16 (leer `apps/web/AGENTS.md`): App Router, todo client-side detrás de `AppShell` (gate de sesión). `/api/*` se reenvía a `API_URL`.
- Diseño: implementa `design/project/Kolektorz Mockups.dc.html` (sistema Modernist en `src/styles/modernist.css`, copia literal). Mobile < 960px, web ≥ 960px (`src/lib/responsive.tsx`). Detalle y decisiones en `docs/frontend-web.md`.
- Datos con React Query (`src/lib/queries.ts`); tras mutar, `useInvalidateAll()`. Montos con `src/lib/format.ts` (`USD 4.250`, signo `−`).
- Lógica pura fuera de los componentes (`src/lib/*`, `features/add/manualInput.ts`) para testearla con Vitest (`@/` apunta a `apps/web/src`).

## Comandos

- `pnpm test` (Vitest contra Postgres `TEST_DATABASE_URL`, trunca la DB de test), `pnpm typecheck`, `pnpm lint`, `pnpm format`.
- `pnpm db:generate` tras cambiar el esquema; `pnpm db:migrate`; `pnpm db:seed`; `pnpm db:seed:demo`.
- API local: `pnpm --filter @kollektor/api dev` (puerto 3001). Web: `pnpm --filter @kollektor/web dev` (puerto 3000; demo@kollektor.app / vinilos-demo tras `pnpm db:seed:demo`).

## Tests

- Integración con fakes de `@kollektor/core/testing` (`FakeCatalog`, `FakeFx`, `seedLibrary`…); nunca llamar APIs reales en tests.
- Tests de API de punta a punta en `apps/api/src/app.test.ts` con `app.request`.
