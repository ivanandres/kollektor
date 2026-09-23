# Pantallas y datos disponibles (guía para diseño)

Qué información y qué acciones ofrece el backend en cada pantalla del MVP. Los ejemplos reales, con el
usuario demo, están en [`api-examples/`](api-examples/). Los nombres de campos son los de la API
([`api.md`](api.md)).

Obligatorio en toda la app:
- **Valor estimado:** mostrar siempre como *estimado*, con la leyenda `disclaimer` y la fuente/fecha (`estimate.source`, `estimate.capturedAt`).
- **Atribución:** donde haya datos de Discogs, mostrar "Datos provistos por Discogs".
- **Privacidad:** la ubicación física y el lugar de compra son solo del dueño. Nunca aparecen en vistas públicas.

---

## Inicio (dashboard) — `GET /dashboard`, `GET /discover`, `GET /me/activity`

- **Números:** `items` (vinilos), `artists`, `albums`, `releases` (ediciones), `invested`, `estimated`, `difference` (en `currency`).
- **"Tu colección en números":** artista, género y década principales; edición más antigua; disco más valioso; compra más cara; última incorporación (cada una con título, artista y valores).
- **Gráficos chicos:** por artista, género, década, país, sello, formato, condición y tipo de edición (`charts.*`: `{ label, count }`).
- **Descubrir:** mensajes listos para mostrar, por ejemplo "Te falta 1 disco para completar Pink Floyd.", "Tu colección tiene discos de 9 décadas distintas.", "Si te gusta Love, quizás quieras explorar The Beatles." o "Hay un Animals a USD 40, por debajo de tu objetivo…". Cada uno trae `type` para elegir el ícono.
- **Actividad reciente:** "Agregaste X a tu colección.", "Desbloqueaste «50 discos».", con portada.
- **Estado vacío:** con 0 discos todo viene en cero. Es el lugar para invitar a agregar el primer disco o importar la colección (de Discogs o desde un CSV).

## Colección — `GET /collection`, `GET /collection/facets`

- **Grid:** `coverImageUrl` (puede ser `null`, sobre todo en cargas manuales, así que hace falta un placeholder), `title`, `artist`.
- **Lista:** además `originalReleaseYear`, `releaseYear`, `country`, `formatSummary`, `editionType`, `conditionMedia` / `conditionSleeve`, `purchasePriceBase`, `estimatedValueBase`.
- **Filtros combinables:** artista, género, estilo, década, rango de años (álbum y edición), país, sello, formato ("LP", "Picture Disc", "12\"", "Limited Edition"…), tipo de edición, condición, tag, ubicación física, rangos de precio pagado y de valor. `facets` da los valores posibles **con cantidades** y los mínimos/máximos para los sliders.
- **Orden:** agregado reciente o antiguo, artista, título, año, más caro, más valioso.
- **Búsqueda dentro de la colección:** parámetro `q`.
- **Paginación:** `page` / `pageSize` (hasta 200), `total`, `pages`.
- Acción "Limpiar filtros".

## Ficha del disco — `GET /collection/:id`

- **Portada grande** e imágenes de la edición (`release.images`). **Fotos de mi copia** (`photos`), que el usuario puede sumar.
- **Álbum:** `release.album.title`, `artistDisplay`, `originalReleaseYear`, `genres`, `styles`.
- **Edición:** `releaseYear`, `country`, `labels[]` (sello y catálogo), `formats[]` (cantidad, tamaño, velocidad, color, descripciones), `editionType`, `barcode`, `notes`, `community.have/want` (cuántos lo tienen o lo buscan en Discogs).
- **Mi copia:** condición del disco y de la tapa (escala Goldmine), `copyNumber` ("245/500"), primera edición, fecha, precio y lugar de compra, ubicación, notas y tags.
- **Valor:** `value.paid`, `value.estimated`, `value.difference` (positiva o negativa), `value.estimate.kind` (`suggestion` = sugerido por condición, `median`, `lowest` = señal más débil, `manual`), más la leyenda.
- **Tracklist:** `tracks[]` con `position` ("A1"), `side` ("A"/"B", para agrupar por lado), `title` y `durationSeconds`.
- **Cada tema →** `GET /catalog/tracks/:id/links`: Spotify y YouTube con estado `found` (con link), `not_found` ("No encontramos este tema.") o `unavailable`, más "Ver letra" (Genius). La primera vez tarda un poco porque se busca en el momento; conviene un estado de carga por tema.
- **Otras ediciones del álbum:** en la base (`/catalog/albums/:id/releases`) y en Discogs (`/catalog/albums/:id/external-versions`).
- `otherCopiesCount` indica si tenés otra copia de la misma edición.
- **Acciones:** editar, borrar, agregar o quitar fotos, "Vincular con Discogs" (para cargas manuales: `release.isVerified = false`).

## Agregar vinilo — flujo móvil clave

1. **Elegir método:** buscar, foto, código de barras o carga manual.
2. **Buscar** (`GET /catalog/external/search`): texto libre, o artista + título, número de catálogo, código de barras, país, año o formato.
3. **Foto** (`POST /catalog/identify/photo`, 1 a 3 fotos): devuelve lo que leyó (`hints`: artista, título, catálogo…), con qué estrategia (`strategies`) y **candidatos**. `remainingToday` es el cupo diario (mostrarlo cuando queda poco).
4. **Código de barras** leído en el teléfono (`POST /catalog/identify/barcode`): gratis e instantáneo.
5. **Lista de candidatos:** portada chica, título, artista, año, país, sellos, catálogo, formatos, have/want. **Cada candidato trae `ownedCopies`, `ownedEditionsOfAlbum` e `inWishlist`**, para mostrar "Ya lo tenés" / "Tenés otra edición" / "Está en tu wishlist". El usuario **siempre** confirma la edición. Para ver todas las ediciones de un álbum: `/catalog/external/masters/:id/versions`.
6. **Completar mi copia:** condición, precio y moneda, fecha, lugar, ubicación, notas y tags. Todo es opcional.
7. **Guardar** (`POST /collection` con `Idempotency-Key`): la respuesta trae los **logros desbloqueados** (`unlockedAchievements`: nombre, descripción e ícono), que son el momento de celebrar.
8. **Manual:** artistas, título, año original, géneros y estilos; año de edición, país, sello y catálogo, formato y tipo de edición; temas con posición y duración.
9. **Mala conexión:** la API tolera reintentos. Conviene guardar el borrador del formulario en el dispositivo.

## Búsqueda global — `GET /search?q=`

Resultados agrupados: **Artistas** (con cantidad de discos), **Álbumes** (portada, año, "en wishlist"), **Ediciones** (sello, catálogo, país, año) y **Temas** (tema, álbum, artista, y a qué disco llevar). Tolera errores de tipeo y combina palabras ("floyd money", "emi 1973").

## Wishlist — `GET /wishlist`

- **Ítem:** álbum (portada, artista, año) y, si se eligió, la edición específica (país, catálogo, formato); `priority` (1 alta, 2 media, 3 baja), `status` (Quiero → Buscando → Encontrado → Comprado), `targetPrice`/`targetCurrency`, `notes`.
- `ownedEditions`: "ya tenés otra edición de este álbum".
- **Alerta de precio:** `market.lowest`/`market.currency` (la copia más barata a la venta hoy) y `belowTarget`, para destacar "¡Está a tu precio!".
- **Acciones:** agregar (desde la búsqueda o la foto), cambiar estado o prioridad, borrar y **"Lo compré"** (`/wishlist/:id/purchase`), que lo pasa a la colección y devuelve logros.

## Estadísticas — `/stats/*`

- **Resumen:** cantidad, invertido, estimado, diferencia, promedio pagado y promedio estimado.
- **Distribuciones** (`/stats/breakdowns`): ranking de artistas, géneros, estilos, décadas, años, países, sellos, formatos, condiciones y tipos de edición.
- **Dónde está el valor** (`/stats/value`): invertido y estimado por artista y por género.
- **Evolución** (`/stats/timeline`): discos agregados por mes, gasto por año (total, compras y promedio), gasto por mes, mes de mayor gasto e **historial de valor de la colección** (`valueHistory`: fecha, invertido y estimado).
- **Repetidos** (`/stats/duplicates`): álbumes que tenés más de una vez.

## Logros — `GET /achievements`, `GET /achievements/essentials`

- **Logro:** `name`, `description`, `icon` (nombre de ícono sugerido: disc, shapes, hourglass, mic, globe, star, sun, hash, image, palette o trophy), `category` (colección, diversidad, tiempo, artistas, países, rareza o discografías), `tier`, `unlocked`, `unlockedAt` y **`progress: { current, target }`**, para barras de progreso tipo "7/10".
- **Discografías esenciales:** por artista, `owned`/`total` y **qué discos faltan** (título y año). Es buen material para una pantalla tipo "completá la colección".

## Perfil y ajustes — `/me/*`

- `username` (con chequeo de disponibilidad), nombre, bio y avatar (subida directa).
- **Privacidad:** perfil, colección y wishlist, cada uno público o privado (todo privado por defecto); mostrar u ocultar precios y valores.
- **Moneda base** (USD, ARS, EUR…): cambia cómo se ven todos los montos.
- **Cuenta de Discogs:** conectar o desconectar; importar la colección de Discogs o un CSV, con progreso (`pending`, `done`, `failed`, `listing`).
- **Exportar** mi colección a CSV y **borrar mi cuenta**.
- **Sesión:** login, registro, recuperar contraseña y, opcionalmente, "Continuar con Google".
