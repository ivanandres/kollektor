# Kollektor

Aplicación mobile-first para gestionar y explorar una colección personal de discos de vinilo:
**qué tengo, qué quiero, cuánto vale y qué me falta.**

El modelo gira alrededor de **la edición que posee el usuario**
(`Artist → Album → Release (edición) → CollectionItem (mi copia)`), no del álbum genérico.

## Estado

| Parte                                        | Estado                                       |
| -------------------------------------------- | -------------------------------------------- |
| Backend (API + dominio + DB + integraciones) | ✅ Fases 1–11 implementadas y testeadas      |
| Frontend web (Next.js, PWA)                  | ✅ Pantallas del handoff de diseño (Fase 12) |
| App móvil (Expo)                             | ⏳ Post-MVP (Fase 13)                        |

Detalle en [`docs/estado-backend.md`](docs/estado-backend.md) y [`docs/frontend-web.md`](docs/frontend-web.md). Para diseñar las pantallas:
[`docs/pantallas-y-datos.md`](docs/pantallas-y-datos.md) (qué datos y acciones tiene cada una). Análisis y decisiones en
[`docs/00-analisis-y-arquitectura.md`](docs/00-analisis-y-arquitectura.md) y [`docs/adr/`](docs/adr/).

## Estructura

```
apps/
  api/                 Hono + Better Auth: HTTP, sesiones, rutas (única puerta de entrada)
  web/                 Next.js (PWA): pantallas mobile (390) y web (1280) del handoff de diseño
packages/
  core/                Dominio: catálogo, colección, wishlist, búsqueda, stats, logros, valuación…
                       + puertos (interfaces) para servicios externos
  integrations/        Adaptadores: Discogs, Spotify, YouTube, Genius, Claude (visión), FX, email, storage
  db/                  Esquema Drizzle + migraciones SQL
  schemas/             Validaciones Zod compartidas (API, web y mobile)
  api-client/          Cliente tipado de la API para web (Next.js) y mobile (Expo)
docs/                  Análisis, ADRs, referencia de la API y ejemplos de respuestas reales
design/                Handoff de Claude Design (mockups Kolektorz + sistema Modernist), solo referencia
```

El dominio (`packages/core`) no conoce HTTP ni proveedores: depende de interfaces (`ports.ts`) que
implementan los adaptadores de `packages/integrations`. Cambiar de Discogs a otra fuente, o de
Postgres full-text a Meilisearch, no toca la lógica de negocio.

## Puesta en marcha (local)

Requisitos: Node 22+, pnpm 10, PostgreSQL 16 (local o Docker).

```bash
pnpm install
cp .env.example .env            # completá BETTER_AUTH_SECRET (32+ caracteres)

# Base de datos: con Docker…
docker compose up -d db         # crea kollektor y kollektor_test
# …o con un Postgres propio: crear las bases kollektor y kollektor_test

pnpm db:migrate                 # aplica migraciones (incluye pg_trgm y unaccent)
pnpm db:seed                    # logros + discografías esenciales curadas
pnpm db:seed:demo               # opcional: demo@kollektor.app / vinilos-demo con 26 discos

pnpm --filter @kollektor/api dev    # API en http://localhost:3001/api
pnpm --filter @kollektor/web dev    # web en http://localhost:3000 (proxy de /api a la API)
```

La web reenvía `/api/*` a `API_URL` (default `http://localhost:3001`), así las cookies de sesión
quedan en el mismo dominio. `WEB_ORIGIN` de la API tiene que ser la URL de la web.

Sin claves externas la app funciona igual: la carga manual, la colección, la búsqueda, las
estadísticas y los logros no dependen de terceros. Cada integración se activa sola al completar
su variable en `.env`:

| Variable                                                        | Habilita                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DISCOGS_USER_TOKEN`                                            | Buscar/importar ediciones, valores de mercado, importar colección de Discogs |
| `DISCOGS_CONSUMER_KEY/SECRET` + `TOKEN_ENCRYPTION_KEY`          | Que cada usuario vincule su cuenta de Discogs (colecciones privadas)         |
| `ANTHROPIC_API_KEY` (+ `VISION_MODEL`, default `claude-opus-5`) | Identificar discos por foto                                                  |
| `SPOTIFY_CLIENT_ID/SECRET`, `YOUTUBE_API_KEY`                   | Links verificados a cada tema                                                |
| `GENIUS_ACCESS_TOKEN`                                           | Link "Ver letra"                                                             |
| `RESEND_API_KEY` + `EMAIL_FROM`                                 | Envío real del mail de recuperación (si no, se loguea en consola)            |
| `STORAGE_*`                                                     | Subida de avatares a R2/S3                                                   |
| `CRON_SECRET`                                                   | Endpoint de mantenimiento (precios, snapshots, reintentos)                   |

## Comandos

```bash
pnpm test            # 121 tests (unitarios + integración contra Postgres + API de punta a punta + lógica de la web)
pnpm --filter @kollektor/web e2e   # 32 tests de punta a punta en navegador (mobile + web)
pnpm typecheck
pnpm lint
pnpm format
pnpm db:generate     # nueva migración tras cambiar packages/db/src/schema
```

Los tests usan `TEST_DATABASE_URL` (default `postgresql://kollektor:kollektor@localhost:5432/kollektor_test`)
y nunca llaman a servicios externos: usan fakes y fixtures.

## Despliegue

- **Ahora (Vercel + Neon + R2):** proyecto de Vercel con root `apps/api` (usa `apps/api/vercel.json`:
  migra y siembra en el build, cron diario de mantenimiento). Variables de entorno según `.env.example`.
  La web es un segundo proyecto de Vercel con root `apps/web` (Next.js, sin configuración extra) y la
  variable `API_URL` apuntando a la API; en la API, `WEB_ORIGIN` es la URL de la web.
- **Después (VPS):** `docker compose --profile prod up -d` (Postgres + migraciones + API + web) con un
  reverse proxy con TLS delante de la web (que ya reenvía `/api` a la API), y un cron del sistema:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://api.tu-dominio/api/cron/maintenance`.
  Migración de datos: `pg_dump` de Neon → `pg_restore` en el VPS. No hay dependencias propietarias de Vercel.

## API

Referencia completa para el frontend: [`docs/api.md`](docs/api.md).
Cliente tipado listo para usar desde web o mobile:

```ts
import { createApiClient } from '@kollektor/api-client';

const api = createApiClient({ baseUrl: '/api' }); // web: cookies
// mobile: createApiClient({ baseUrl, getToken, onToken })         // bearer token en SecureStore
const { items } = await api.collection.list({ genre: ['Rock'], decade: [1970] });
const { item, unlockedAchievements } = await api.collection.add(
  { discogsReleaseId: 1873013 },
  formKey,
);
```

Respuestas reales generadas con el usuario demo: [`docs/api-examples/`](docs/api-examples/).
