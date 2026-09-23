# Kollektor — Análisis, arquitectura y roadmap (pre-Fase 1)

> Estado: **propuesta para validar**. Todavía no se escribió código de la aplicación.
> Principio rector: el objeto central no es el álbum, es **la edición que posee el usuario**.
> Pregunta de producto: *¿Qué tengo, qué quiero, cuánto vale y qué me falta?*

---

## 1. Lectura del requerimiento

El producto es una **herramienta personal de coleccionista**, mobile-first para el caso "estoy en la disquería", y analítica en desktop. El MVP incluye 18 capacidades (auth, colección, Discogs, identificación por foto, wishlist, búsqueda, filtros, ficha, links externos, valor, estadísticas, logros). Lo social queda fuera, pero el modelo tiene que admitirlo sin migraciones dolorosas.

La cadena conceptual es:

```
Artist ─┐
        ├─< Album (≈ "master" de Discogs) ─< Release (edición) ─< CollectionItem (mi copia)
Label ──┘                                          └─< Track
```

---

## 2. Inconsistencias y decisiones a tomar

Estas son las ambigüedades encontradas en el requerimiento, con la **recomendación** que tomaría si no se indica otra cosa.

| # | Tema | Problema | Recomendación |
|---|------|----------|---------------|
| 1 | **Tracks: ¿de Album o de Release?** | El modelo del punto 21 dice "album/release". Las ediciones tienen tracklists distintos (bonus tracks, 2×LP vs 1×LP, lados distintos). | Tracks pertenecen a **Release**. El Album tiene un `main_release_id` que define su tracklist "canónico" (igual que el *main release* de un master en Discogs). |
| 2 | **Varios artistas por álbum** | `Album.artist_id` no soporta colaboraciones ("Bowie & Queen"), splits ni compilados "Various". | Tabla `album_artists` (N:M con orden y `join_phrase`). |
| 3 | **Varios sellos / catálogos por edición** | `Release.label` y `catalog_number` como campos únicos no alcanzan: muchas ediciones tienen 2+ sellos con catálogos distintos. | Tabla `release_labels(release_id, label_id, catalog_number)`. |
| 4 | **Formato** | "Formato" es en realidad estructurado: cantidad (2×), tipo (Vinyl), tamaño (12"), velocidad (33⅓), descripciones (LP, Gatefold, Picture Disc, Limited), color. | Tabla `release_formats` estructurada + `format_summary` de texto para mostrar. Habilita los logros "picture disc", "edición limitada". |
| 5 | **"Número de edición"** | Mezcla dos cosas: el *tipo* de edición (reissue, remaster — atributo de la Release) y el *número de copia* de una tirada numerada ("#245/500" — atributo de **mi copia**). | `Release.edition_type` + `CollectionItem.copy_number`. |
| 6 | **Valor estimado: ¿de la edición o de mi copia?** | El modelo pone `estimated_value` en `CollectionItem`, pero el valor de mercado es de la Release (y depende de la condición). | Snapshots de precio por **Release** (`price_snapshots`, con condición opcional). El `CollectionItem` resuelve su valor desde ahí, con **override manual** opcional. Esto además da el histórico pedido en el punto 10. |
| 7 | **Monedas** | Se compra en ARS, USD, EUR… Sumar "USD 4.250 invertidos" requiere conversión. Con inflación (ARS) convertir a tasa de hoy distorsiona la inversión. | Guardar **precio y moneda originales** + **conversión a moneda base del usuario a la fecha de compra**. Moneda base configurable (default USD). |
| 8 | **Catálogo manual: ¿global o privado?** | Si un usuario carga a mano un disco, ¿lo ven los demás? Si es global, se llena de duplicados y datos erróneos sin moderación. | Catálogo compartido **solo para datos de fuentes externas** (Discogs). Lo cargado a mano queda `created_by_user_id = X`, `is_verified = false`, visible solo para su creador. En V2 se puede agregar "vincular con Discogs" / moderación. |
| 9 | **Wishlist: ¿álbum o edición?** | El punto 14 permite "edición específica" opcional. | `WishlistItem.album_id` obligatorio, `release_id` opcional ("quiero *cualquier* Dark Side" vs "quiero la japonesa del 73"). |
| 10 | **Estado "Comprado" vs "mover a colección"** | Si se mueve, se pierde el historial de deseo. | Al comprar: se crea el `CollectionItem`, y el wishlist item queda `status = purchased` con `collection_item_id` (no se borra). Se oculta de la vista por defecto. |
| 11 | **"Discografía completa"** | Requiere una fuente de verdad que no existe (Discogs lista *todo*). | `essential_lists` curadas (seed en JSON versionado en el repo, ~20 artistas iniciales). Se cuenta como "tengo el álbum" si poseo **cualquier** edición de ese álbum. |
| 12 | **"Primera edición"** | Discogs no marca de forma fiable "first pressing". | Heurística (año de edición = año original y país de origen) **+ flag manual del usuario**. El logro usa el flag o la heurística confirmada. |
| 13 | **Alcance del buscador** | "Buscar cualquier cosa" puede significar: mi colección, mi wishlist, el catálogo local, o Discogs. | Buscador global = **mi colección + mi wishlist** (rápido, local). En el flujo "Agregar vinilo" el buscador consulta **Discogs**. Son dos buscadores con UI distinta. |
| 14 | **¿Solo vinilo?** | El nombre dice vinilo, pero la gente tiene CDs/cassettes y Discogs los devuelve. | El modelo soporta cualquier formato; la UI es vinyl-first y por defecto filtra vinilo en Discogs. Las estadísticas "vinilos" cuentan copias físicas. |
| 15 | **Contar "vinilos"** | ¿Un 2×LP es 1 o 2 vinilos? | 1 ítem de colección = 1 "disco". Se muestra aparte "unidades físicas" si hace falta. |
| 16 | **Privacidad granular** | Perfil público ≠ colección pública ≠ precios públicos. | Campos separados: `profile_visibility`, `collection_visibility`, `wishlist_visibility`, `show_prices`, `show_values`. Todo **privado por default**. `storage_location` y `purchase_place` **nunca** se exponen. |
| 17 | **Logros al borrar discos** | Si llego a 100 y borro uno, ¿pierdo el logro? | Los logros desbloqueados **no se revocan** (sensación de progreso). El progreso actual sí se recalcula. |
| 18 | **Links "no inventar"** vs APIs restringidas | Spotify/YouTube tienen cuotas estrictas (ver riesgos). | Link **verificado** si hubo match por API (con confianza). Si no, mostrar "No encontramos este tema" + opcionalmente un botón explícito **"Buscar en Spotify/YouTube"** (link de búsqueda, claramente rotulado como búsqueda, no como match). |

---

## 3. Stack propuesto

Criterio: una sola base de código TypeScript, full-stack, desplegable en minutos, con Postgres real.

| Capa | Elección | Por qué |
|------|----------|---------|
| Repo | **Monorepo pnpm + Turborepo** | Web, API y (más adelante) app móvil comparten tipos, validaciones y cliente de API. |
| API | **Hono** (TypeScript) con contrato tipado (Hono RPC / OpenAPI) | Una sola API para web y apps nativas. Corre igual en Vercel Functions y en un contenedor Node en un VPS. |
| Web | **Next.js (App Router) + TypeScript** | Consume la API; SSR para perfiles públicos en V2; `output: 'standalone'` para correr en Docker. La lógica de negocio **no** vive en Server Actions. |
| App móvil (post-MVP) | **Expo / React Native** | Build nativo para iOS y Android desde TypeScript; cámara y escáner de código de barras nativos. Ver ADR 0001. |
| UI | **Tailwind CSS + shadcn/ui** (Radix) | Componentes accesibles, sin "look corporativo" impuesto; fácil de darle identidad propia. |
| Gráficos | **Recharts** | Simple, responsive, suficiente para barras/donas/líneas. |
| Base de datos | **PostgreSQL** (Neon en prod, Docker en local) | Relacional, `pg_trgm` + `unaccent` + full-text para búsqueda fuzzy sin infraestructura extra. |
| ORM | **Drizzle ORM** | Esquema en TS, migraciones SQL legibles, fácil de usar SQL crudo para búsqueda/estadísticas (índices GIN/trigram). |
| Auth | **Better Auth** (email+password, reset por mail; Google opcional) | Sesiones en nuestra DB, adapter Drizzle, sin vendor lock-in. |
| Validación | **Zod** | Mismos esquemas en formularios y server actions. |
| Formularios | React Hook Form + borradores en IndexedDB | Punto 25: no perder formularios con mala conexión. |
| Storage de imágenes | **S3-compatible (Cloudflare R2)** | Avatares y fotos subidas por el usuario. |
| Email | **Resend** | Recuperación de contraseña. |
| Jobs | Tabla `sync_jobs` en Postgres + disparador por cron (Vercel Cron hoy, cron del sistema en el VPS) | Refresco de precios/sync de Discogs respetando rate limit, sin infraestructura extra ni dependencia de un proveedor. |
| Visión | **Claude (Anthropic API, visión)** + lector de código de barras en el cliente (`BarcodeDetector` / `zxing-wasm`) | Ver sección 8. |
| Mobile (MVP) | **PWA** (instalable, cámara vía `<input capture>` / `getUserMedia`) | Suficiente para uso personal mientras no exista la app nativa. |
| Tests | **Vitest** (unit/integración con Postgres de test) + **Playwright** (e2e mobile y desktop) | |
| Hosting | **Vercel + Neon + R2** ahora → **VPS con Docker Compose** después | Sin servicios propietarios de Vercel (KV, Blob, Edge Config): la migración es cambiar variables de entorno y `pg_dump`/`pg_restore`. |

**Decisión importante a explicitar:** arquitectura **API-first en monorepo**. El MVP se lanza como web + PWA; las apps de iOS/Android se construyen después con Expo sobre la misma API, sin reescribir backend ni lógica. Detalle y alternativas descartadas en [`adr/0001-plataforma-movil-y-despliegue.md`](adr/0001-plataforma-movil-y-despliegue.md).

---

## 4. Arquitectura

Monolito modular, API-first: los clientes (web hoy, mobile mañana) hablan con una única API; el dominio no conoce a los clientes. Dependencias en una sola dirección:

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js)          apps/mobile (Expo, post-MVP)   │  ← UI: no contiene lógica de negocio
└───────────────┬─────────────────────────────────────────────┘
                ▼  HTTP tipado (packages/api-client)
┌─────────────────────────────────────────────────────────────┐
│  apps/api (Hono): rutas, auth, validación Zod               │
└───────────────┬─────────────────────────────────────────────┘
                ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/core  (dominio)                                   │
│  auth · profiles · catalog · collection · wishlist · search │
│  stats · achievements · discovery · valuation · currency    │
│  cada uno: service.ts · repository.ts · schemas.ts · types  │
└───────────────┬─────────────────────────────────────────────┘
                ▼  (solo a través de interfaces)
┌─────────────────────────────────────────────────────────────┐
│  packages/integrations (adaptadores, no importan dominio)   │
│  DiscogsService · SpotifyService · YouTubeService           │
│  LyricsService · CoverRecognitionService · FxRateService    │
│  StorageService · EmailService                              │
└─────────────────────────────────────────────────────────────┘
```

### Interfaces (puertos) clave

```ts
interface CatalogProvider {            // implementado por DiscogsService
  searchReleases(q: CatalogQuery): Promise<CatalogSearchResult[]>;   // texto, artista, título, catno, barcode, país, año, formato
  getRelease(externalId: string): Promise<ExternalRelease>;          // tracklist, imágenes, sellos, formatos, identificadores
  getMaster(externalId: string): Promise<ExternalMaster>;
  getMasterVersions(externalId: string): Promise<CatalogSearchResult[]>;
  getArtist(externalId: string): Promise<ExternalArtist>;
}

interface MarketValueProvider {         // también DiscogsService
  getValue(releaseExternalId: string, condition?: Grade): Promise<MarketValue | null>;
}

interface MusicLinkProvider {           // SpotifyService, YouTubeService
  findTrack(q: { artist: string; title: string; album?: string; durationSec?: number }):
    Promise<{ url: string; externalId: string; confidence: number } | null>;
}

interface LyricsProvider {              // LyricsService (Genius primero)
  findLyricsPage(q: { artist: string; title: string }): Promise<{ url: string } | null>;
}

interface CoverRecognizer {             // CoverRecognitionService
  extract(image: Blob): Promise<{ artist?: string; title?: string; catalogNumber?: string;
                                  label?: string; barcode?: string; confidence: number }>;
}

interface SearchProvider {              // PostgresSearchProvider hoy, Meilisearch/Typesense mañana
  search(userId: string, q: string, opts: SearchOptions): Promise<GroupedResults>;
}
```

Reglas:
- Los **mappers** convierten DTOs de Discogs → tipos propios (`ExternalRelease`). Ningún tipo de Discogs sale de `integrations/discogs/`.
- La **importación** (`catalog/importer.ts`) es la única que escribe datos externos en nuestras tablas: upsert por `(source, external_id)`, guarda `last_synced_at`.
- Una vez importada, la ficha y la colección **leen solo de nuestra DB**. Discogs se consulta únicamente al buscar/agregar o en jobs de refresco.
- Cada cambio de colección emite un **evento de dominio** (`activity_events`) que dispara: evaluación de logros, snapshot de valor y (en V2) el feed social.

---

## 5. Esquema de base de datos

Convenciones: `id uuid` (v7, ordenables), `created_at`/`updated_at timestamptz`, dinero en `numeric(12,2)` + `char(3)` de moneda, columnas `*_normalized` (minúsculas, sin acentos, sin artículo inicial) para búsqueda y orden.

### Usuarios
```
users, sessions, accounts, verifications      -- gestionadas por Better Auth
profiles
  user_id PK/FK · username UNIQUE · display_name · avatar_url · bio
  profile_visibility    enum(private, public)          default private
  collection_visibility enum(private, public)          default private
  wishlist_visibility   enum(private, public)          default private
  show_prices bool default false · show_values bool default false
  base_currency char(3) default 'USD' · locale
```

### Catálogo (compartido; filas manuales son privadas de su creador)
```
artists        id · name · name_normalized · sort_name · image_url · profile
               created_by_user_id NULL · is_verified
labels         id · name · name_normalized · created_by_user_id NULL
external_ids   entity_type(artist|album|release|label|track) · entity_id · source(discogs|musicbrainz|…)
               external_id · url · last_synced_at · UNIQUE(entity_type, source, external_id)
albums         id · title · title_normalized · original_release_year · description
               cover_image_url · main_release_id NULL · created_by_user_id NULL · is_verified
album_artists  album_id · artist_id · position · join_phrase · role
genres / styles                      id · name UNIQUE
album_genres / album_styles          album_id · genre_id|style_id
releases       id · album_id · title (si difiere) · release_year · release_date NULL · country
               edition_type enum(original, reissue, remaster, limited, promo, bootleg, other)
               format_summary · barcode · notes · community_have · community_want
               created_by_user_id NULL · is_verified
release_labels  release_id · label_id · catalog_number · position
release_formats release_id · name(Vinyl|CD|Cassette…) · qty · size · speed · color · descriptions text[]
release_images  release_id · kind(primary|secondary|user) · url · storage_key · width · height
tracks          id · release_id · position("A1") · side("A") · disc_number · sequence
                title · title_normalized · duration_seconds · credits jsonb
track_links     track_id · provider(spotify|youtube|lyrics) · status(found|not_found)
                url · external_id · confidence · checked_at
```

### Colección y wishlist
```
collection_items  id · user_id · release_id
                  condition_media / condition_sleeve  enum Goldmine (M, NM, VG+, VG, G+, G, F, P)
                  copy_number NULL ("245/500") · is_first_pressing NULL (flag manual)
                  purchase_date · purchase_price · purchase_currency · purchase_price_base (convertido)
                  purchase_place (privado) · storage_location (privado, nunca público)
                  notes · value_override NULL · value_override_currency
                  created_at · updated_at · deleted_at (soft delete)
tags              id · user_id · name · UNIQUE(user_id, name)
collection_item_tags  collection_item_id · tag_id
wishlist_items    id · user_id · album_id · release_id NULL
                  target_price · target_currency · priority(1..3)
                  status enum(wanted, searching, found, purchased)
                  notes · collection_item_id NULL · created_at
```

### Valor
```
price_snapshots            release_id · source · kind(suggestion|lowest|median|manual)
                           condition NULL · price · currency · captured_at
collection_value_snapshots user_id · captured_on date · item_count
                           total_invested · total_estimated · currency   UNIQUE(user_id, captured_on)
fx_rates                   date · base · quote · rate                    UNIQUE(date, base, quote)
```

### Gamificación y descubrimiento
```
achievements       id · code UNIQUE · name · description · icon · category · tier
                   criteria jsonb · is_active · sort_order
user_achievements  user_id · achievement_id · unlocked_at   PK(user_id, achievement_id)
essential_lists    id · artist_id · name · version · source
essential_list_items  list_id · album_id · position
```

Ejemplos de `criteria` (evaluados por un motor de reglas pequeño):
```json
{ "type": "count",           "min": 100 }
{ "type": "distinct",        "field": "genre",   "min": 10 }
{ "type": "distinct",        "field": "decade",  "min": 7 }
{ "type": "distinct",        "field": "country", "min": 5 }
{ "type": "has_release",     "where": { "country": "Japan" } }
{ "type": "has_release",     "where": { "format_description": "Picture Disc" } }
{ "type": "essential_list",  "list_code": "led-zeppelin-studio" }
```

### Preparado para V2 (se crea ya, cuesta poco)
```
activity_events  id · user_id · type(collection.added, wishlist.added, achievement.unlocked…)
                 subject_type · subject_id · payload jsonb · visibility · created_at
```
Sirve hoy para "discos agregados por mes" y para disparar logros; en V2 es la base del feed. Las tablas `follows`, `likes`, `comments` se agregan en V2 apuntando a `profiles`, `collection_items` y `activity_events` sin tocar lo existente.

### Índices relevantes
- GIN `pg_trgm` sobre `artists.name_normalized`, `albums.title_normalized`, `tracks.title_normalized`, `labels.name_normalized`, `release_labels.catalog_number`.
- `collection_items(user_id, deleted_at)`, `wishlist_items(user_id, status)`.
- `releases(barcode)`, `external_ids(source, external_id)`.

---

## 6. Búsqueda y filtros

**Búsqueda (MVP en Postgres):**
1. Normalizar la consulta (minúsculas, `unaccent`, colapsar espacios).
2. Tokenizar. Tokens de 4 dígitos entre 1900 y el año actual también se interpretan como año.
3. Cada token debe coincidir con **algún** campo (AND entre tokens, OR entre campos) → "pink dark", "floyd money", "emi 1973" funcionan.
4. Ranking: exacto > prefijo > `similarity()` trigram (fuzzy: "led zepelin" encuentra "Led Zeppelin").
5. Resultados **agrupados**: Artistas · Álbumes · Ediciones (sello/catálogo/país) · Canciones (con el álbum que la contiene).
6. Alcance: colección + wishlist del usuario. Con colecciones personales (cientos a pocos miles de ítems) esto responde en milisegundos.

`SearchProvider` es una interfaz: si en el futuro se busca sobre catálogos públicos de muchos usuarios, se reemplaza por Meilisearch/Typesense sin tocar la UI.

**Filtros:** estado en la URL (`?genre=rock&decade=1970&artist=…`) → compartible, sobrevive al refresh y al botón atrás. Un query builder server-side combina filtros con AND (y OR dentro del mismo filtro multi-valor). Cada filtro muestra conteos (facetas). Botón "Limpiar filtros" = navegar a la URL sin query.

---

## 7. Estructura de carpetas

```
kollektor/
├── apps/
│   ├── api/                       # Hono: rutas HTTP, auth, cron endpoints · Dockerfile
│   ├── web/                       # Next.js: páginas, componentes web, PWA · Dockerfile
│   │   └── src/app/
│   │       ├── (auth)/            # login, register, forgot-password, reset-password
│   │       └── (app)/             # inicio, collection/[itemId], add/{search,scan,manual},
│   │                              # wishlist, search, stats, achievements, profile
│   └── mobile/                    # Expo (se crea en la Fase 13)
├── packages/
│   ├── core/                      # dominio: modules/{catalog,collection,wishlist,search,stats,
│   │                              #   achievements,discovery,valuation,currency}/
│   │                              #   service · repository · types · *.test.ts
│   ├── integrations/              # discogs · spotify · youtube · lyrics · vision · fx · storage · email
│   │                              #   + ports.ts (interfaces)
│   ├── db/                        # esquema Drizzle, migraciones, seed (achievements, essential lists)
│   ├── schemas/                   # Zod compartido (web, mobile, api)
│   ├── api-client/                # cliente tipado + hooks TanStack Query (web y mobile)
│   └── config/                    # tsconfig, eslint, tokens de diseño compartidos
├── tests/e2e/                     # Playwright (viewport móvil + desktop)
├── docker-compose.yml             # dev local hoy; producción en VPS mañana (postgres, api, web, worker)
├── turbo.json · pnpm-workspace.yaml
└── .env.example
```

`packages/*` no importa nada de React DOM ni de React Native: todo lo que está ahí se comparte entre web y mobile.

## 8. APIs externas necesarias

| Servicio | Uso | Auth | Notas |
|----------|-----|------|-------|
| **Discogs API** | Buscar releases/masters/artistas, catálogo, barcode, tracklist, imágenes, formatos, `have/want`, datos de mercado | Personal token de la app; **OAuth 1.0a por usuario** (opcional) | ~60 req/min autenticado. Exige atribución y User-Agent propio. |
| **Anthropic API (Claude, visión)** | Extraer artista/título/catálogo/sello de foto de portada, contratapa o etiqueta | API key | Devuelve JSON estructurado; nunca decide la edición. |
| **Spotify Web API** | Match de canciones → link | Client credentials | Ver riesgos: políticas de acceso restrictivas. |
| **YouTube Data API v3** | Match de canciones → link | API key | Cuota diaria baja para búsquedas. |
| **Genius API** | URL de la página de letra ("Ver letra") | Token | No devuelve letras (correcto para nuestro caso). |
| **MusicBrainz** (opcional) | ISRC/recording IDs para mejorar matching con Spotify | Sin auth (1 req/s) | Fuente alternativa futura de catálogo. |
| **Tipos de cambio** (ej. Frankfurter/ECB u otro proveedor) | Conversión a moneda base por fecha | Variable | Para ARS puede requerir un proveedor que publique cotizaciones útiles. |
| **Resend**, **R2** | Email de reset, almacenamiento de imágenes | API key | Infraestructura. |

Extra de alto valor y bajo costo: **importar la colección existente de Discogs** del usuario (vía OAuth / colección pública). Para un coleccionista que ya usa Discogs, es la diferencia entre cargar 172 discos a mano o en un minuto. Lo propongo como opcional dentro de la Fase 5.

---

## 9. Riesgos técnicos

### Discogs
- **Rate limit compartido** (~60 req/min por token/IP): con muchos usuarios la cuota se agota. → Cache local agresivo (una Release se importa una vez para todos los usuarios), cola de jobs con throttling, backoff ante 429, OAuth por usuario para repartir cuota.
- **Términos de uso**: exigen atribución visible ("Datos provistos por Discogs"), limitan ciertos usos comerciales y de redistribución, y las **imágenes** tienen condiciones distintas a los datos. → Revisar los ToS vigentes antes de la Fase 5; guardar URLs + atribución, no re-servir imágenes masivamente sin confirmar que está permitido.
- **Calidad de datos**: duplicados, ediciones casi idénticas, países "Europe"/"UK & Europe". → Por eso el usuario **siempre confirma** la edición, mostrando las diferencias clave (país, año, sello, catálogo, barcode, notas de matriz).

### Valor de mercado
- La API **no** expone el historial de ventas (mediana/máximo que se ve en la web).
- `lowest_price` / `num_for_sale` reflejan **la oferta más barata**, no el valor: sesgado y a veces vacío.
- `price_suggestions` da un valor **por condición** (el más útil), pero requiere OAuth de un usuario con configuración de vendedor completa.
→ Mostrar siempre **"Valor estimado"** con fuente y fecha, permitir override manual, y tratarlo como indicador, no tasación. Refresco periódico (ej. semanal) por job, no en cada visita.

### Reconocimiento de imágenes
- OCR puro falla en portadas artísticas (tipografías ilegibles, portadas sin texto: *Dark Side*, *Abbey Road* sin título…).
- No existe búsqueda por imagen pública en Discogs.
→ Estrategia en cascada:
  1. **Código de barras** (contratapa) → búsqueda exacta. Muy preciso, pero no existe en ediciones previas a ~1980.
  2. **Número de catálogo** de lomo/etiqueta vía visión → búsqueda por `catno`.
  3. **Portada** vía modelo de visión → artista + título → búsqueda.
  4. Siempre: lista de **candidatos** + filtros (país, año, formato) para que el usuario elija. Nunca auto-seleccionar.
- Costo por foto de la API de visión: bajo por llamada pero no nulo → limitar por usuario/día.

### Spotify / YouTube
- Spotify endureció en los últimos años el acceso a su Web API para apps nuevas (endpoints deprecados, modo desarrollo con usuarios limitados, requisitos altos para cuota extendida). → Tratar Spotify como **mejor esfuerzo**, verificar condiciones vigentes al llegar a la Fase 9; consultar solo desde el servidor con client credentials y cachear en `track_links`.
- YouTube Data API: una búsqueda consume ~100 unidades de una cuota diaria default de 10.000 (≈100 búsquedas/día). → Búsqueda **lazy** (solo al abrir un tema), cache permanente, y fallback a link de búsqueda rotulado.
- Matching incorrecto (versión en vivo, remaster, cover). → Usar duración y álbum para puntuar; si la confianza es baja, **no mostrar** como match.

### Letras
- No almacenar letras. Genius devuelve solo la URL → cumple "Ver letra" con enlace externo. Musixmatch es la alternativa licenciada (paga) si en el futuro se quiere mostrar la letra in-app.

### Otros
- **Moneda/inflación** (ARS): sin conversión por fecha, las estadísticas de inversión son engañosas.
- **iOS PWA**: cámara y almacenamiento con limitaciones; probar en dispositivo real desde temprano.
- **Privacidad**: la colección tiene valor económico → tests explícitos de que campos privados nunca salen en respuestas públicas (V2) y consultas siempre filtradas por `user_id`.

---

## 10. Roadmap de implementación

Cada fase cierra con: tests verdes → revisión de errores → verificación manual en móvil y desktop → documento `docs/fase-XX.md` → recién entonces la siguiente.

| Fase | Entregable | Hecho cuando… |
|------|------------|---------------|
| **1. Setup + arquitectura + DB** | Next.js + TS + Tailwind/shadcn, Drizzle + Postgres (Docker), esquema completo y migraciones, seed de géneros/achievements, Vitest + Playwright, lint/format, CI (GitHub Actions), `.env.example`, layout con navegación mobile (bottom nav) y desktop (sidebar). | `npm test`, `npm run lint`, migraciones y seed corren en limpio; app arranca con navegación vacía. |
| **2. Auth + usuarios** | Registro, login, logout, recuperar contraseña, perfil (username, avatar, bio), privacidad y moneda base. | Flujo e2e completo; rutas protegidas; username único validado. |
| **3. Catálogo** | Módulo `catalog` (artistas, álbumes, releases, sellos, formatos, tracks) con repositorios, normalización y upserts por `external_ids`. | Tests de integración de creación/upsert/dedupe. |
| **4. Colección** | Grid/lista, ficha básica, editar/borrar ítem, tags, condición Goldmine, precios con conversión a moneda base. | CRUD e2e; totales invertidos correctos en varias monedas. |
| **5. Discogs** | `DiscogsService` (client con rate limit + retry + cache), mappers, importador, búsqueda por texto/catálogo/barcode, versiones de un master, atribución. Opcional: importar colección de Discogs. | Tests con fixtures grabadas (sin red en CI); import idempotente. |
| **6. Agregar vinilo** | Flujo "+ Agregar": buscar en Discogs → elegir edición → completar compra; manual; **identificar por foto** (barcode + visión + candidatos); borradores persistentes. | Criterios 3–6 del MVP e2e en viewport móvil; formulario sobrevive a recarga/corte. |
| **7. Wishlist** | CRUD, álbum o edición, prioridad, estados, precio objetivo, "Agregar a mi colección". | Conversión wishlist → colección conserva historial. |
| **8. Búsqueda + filtros** | `PostgresSearchProvider`, resultados agrupados, fuzzy, filtros combinables con facetas en URL. | Casos "Love", "Pink Floyd", "Dark Side", "Money", "1973", "EMI" con tests. |
| **9. Ficha + tracklist + links** | Ficha completa, tracklist por lados, `SpotifyService`/`YouTubeService`/`LyricsService` lazy con cache, valor estimado con fuente/fecha. | Nunca se muestra un link no verificado como match. |
| **10. Dashboard + estadísticas** | Números clave, "Tu colección en números", gráficos por artista/género/década/país/sello/formato/condición, compras por año/mes, snapshots de valor. | Estadísticas verificadas contra dataset seed conocido. |
| **11. Logros + descubrimiento** | Motor de reglas, badges, progreso, essential lists curadas, sección Explorar ("te falta 1 para completar…"). | Tests por tipo de criterio; desbloqueo en tiempo real al agregar. |
| **12. Refinamiento** | Identidad visual, animaciones de desbloqueo, PWA instalable, accesibilidad, performance, e2e completo de los 16 criterios de éxito. | Checklist de criterios de éxito 100% verde. |
| **13. App móvil (post-MVP)** | `apps/mobile` con Expo: auth con tokens en almacenamiento seguro, escáner nativo de código de barras, cámara, colección, agregar y wishlist sobre la misma API. Builds con EAS y publicación en App Store y Google Play. | Flujo "estoy en la disquería" completo en iOS y Android físicos; apps aprobadas en ambas tiendas. |
| **14. Migración a VPS** (cuando convenga) | `docker compose` en VPS: postgres, api, web, worker, reverse proxy con TLS, backups automáticos. | Restore de backup probado; DNS apuntando al VPS; Vercel/Neon dados de baja. |

---

## 11. Preguntas abiertas (con default propuesto)

1. **Moneda base**: ¿USD por defecto con conversión a la fecha de compra? *(default: sí)*
2. **Discos cargados a mano**: ¿privados del usuario hasta V2? *(default: sí)*
3. **Formatos**: ¿solo vinilo o también CD/cassette? *(default: modelo soporta todo, UI vinyl-first)*
4. **Essential lists**: ¿las curamos nosotros en el repo para ~20 artistas iniciales? ¿cuáles? *(default: sí; lista inicial por definir: Beatles, Pink Floyd, Led Zeppelin, Bowie, Miles Davis, Radiohead, Rolling Stones, Queen, Charly García, Spinetta…)*
5. **Discogs OAuth por usuario** + importar colección existente en el MVP? *(default: sí, opcional para el usuario)*
6. **Idioma de la UI**: ¿español rioplatense únicamente, o i18n preparado desde el inicio? *(default: español, con strings centralizados para i18n futuro)*
7. ~~**Hosting**~~ *(decidido: Vercel + Neon + R2 ahora, VPS después; ver ADR 0001)*
8. **API de visión (Claude)**: ¿aceptable el costo por foto con límite diario por usuario? *(default: sí, 30 fotos/día)*
9. **Logros**: ¿no se revocan al borrar discos? *(default: no se revocan)*
