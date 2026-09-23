# API de Kollektor — referencia para el frontend

Base: `/api` (local: `http://localhost:3001/api`). JSON en todo, salvo el export CSV y la subida de fotos
(también acepta multipart). Ejemplos reales de cada respuesta en [`api-examples/`](api-examples/).

## Convenciones

- **Autenticación**
  - **Web:** cookies de sesión (Better Auth). Hay que enviar las requests con `credentials: 'include'`
    desde el origen configurado en `WEB_ORIGIN`.
  - **Mobile:** `Authorization: Bearer <token>`. El token llega en el header `set-auth-token` de las
    respuestas de sign-in y sign-up.
- **Errores:** siempre con esta forma:
  `{ "error": { "code": "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "NOT_CONFIGURED" | "UNAUTHORIZED" | "FORBIDDEN" | "UPSTREAM_UNAVAILABLE" | "INTERNAL", "message": "…en español, apto para mostrar", "issues"?: [{ path, message }] } }`.
  Los códigos HTTP correspondientes son 400 / 404 / 409 / 429 / 503 / 401 / 403 / 502 / 500.
- **Mala conexión:** los POST que crean discos o ítems de wishlist aceptan el header
  `Idempotency-Key: <uuid>` (o el campo `clientRequestId`). Si se reintenta la misma request, se devuelve
  el disco ya creado (200) en lugar de duplicarlo. Conviene generar la key al abrir el formulario.
- **Límite de uso:** los endpoints que consultan servicios externos (`/catalog/external/*`,
  `/catalog/identify/*`, `/imports/*`) aceptan hasta 30 requests por minuto por usuario. Al pasarlo
  responden 429 con el header `Retry-After`.
- **Atribución:** toda respuesta con datos de Discogs incluye `attribution: "Datos provistos por Discogs"`,
  que la interfaz debe mostrar.
- **Montos:** los importes en `*Base` están expresados en la moneda base del usuario (`baseCurrency`
  del perfil). El valor estimado es **estimado**: cada respuesta trae el texto `disclaimer` para mostrar.
- **Condición:** escala Goldmine: `M`, `NM`, `VG+`, `VG`, `G+`, `G`, `F`, `P`.

## Auth (Better Auth)

| Método y ruta | Body | Notas |
|---|---|---|
| `POST /auth/sign-up/email` | `{ name, email, password }` | Crea la cuenta y un perfil **privado** con username sugerido |
| `POST /auth/sign-in/email` | `{ email, password }` | Cookie de sesión + header `set-auth-token` |
| `POST /auth/sign-out` | — | |
| `POST /auth/sign-in/social` | `{ provider: "google", callbackURL }` | Solo si están configuradas `GOOGLE_CLIENT_ID/SECRET`. Devuelve la URL de Google a la que hay que redirigir |
| `GET /auth/get-session` | — | Sesión actual o `null` |
| `POST /auth/request-password-reset` | `{ email, redirectTo }` | Envía un mail con un link; `redirectTo` es la pantalla web para elegir la contraseña nueva, que recibe `?token=` |
| `POST /auth/reset-password` | `{ token, newPassword }` | Cierra las demás sesiones |
| `POST /auth/delete-user` | `{ password }` | "Borrar mi cuenta": elimina al usuario y todos sus datos (colección, wishlist, cargas manuales, fotos registradas) |

## Perfil

| Método y ruta | Descripción |
|---|---|
| `GET /me/profile` | Perfil y ajustes de privacidad |
| `PATCH /me/profile` | Campos opcionales: `username`, `displayName`, `bio`, `avatarUrl`, `profileVisibility`, `collectionVisibility`, `wishlistVisibility` (`private`/`public`), `showPrices`, `showValues`, `baseCurrency` (ISO 4217), `locale`. Cambiar `baseCurrency` recalcula toda la colección |
| `GET /me/username-available?username=` | `{ username, available }` |
| `POST /me/avatar-upload` | `{ contentType: image/jpeg\|png\|webp }` → `{ uploadUrl, publicUrl, method: "PUT", headers }`. El cliente hace `PUT` del archivo a `uploadUrl` y después `PATCH /me/profile { avatarUrl: publicUrl }`. Al registrarla se verifica que la imagen exista y pese menos de 5 MB (si pesa más, se borra) |

### Cuenta de Discogs vinculada (opcional)

| Método y ruta | Descripción |
|---|---|
| `GET /me/discogs` | `{ connected, username, connectedAt }` |
| `POST /me/discogs/connect` | `{ returnTo? }` → `{ authorizeUrl }`. El cliente abre esa URL. Al autorizar, Discogs pasa por `/api/discogs/callback`, que **no vincula nada**: redirige a `returnTo` (la web o el deep link de `DISCOGS_CONNECT_RETURN_URL`) con `?discogs=authorized&oauth_token=…&oauth_verifier=…`, o con `?discogs=cancelled` si se rechazó |
| `POST /me/discogs/complete` | `{ oauthToken, oauthVerifier }` desde esa pantalla, **con la sesión del usuario**. Solo quien inició la conexión puede completarla, y cada token se usa una sola vez |
| `DELETE /me/discogs` | Desvincula la cuenta y borra los tokens, que se guardan cifrados |

Con la cuenta vinculada, `POST /imports/discogs` sin `username` importa **tu** colección, aunque sea privada.

## Colección

| Método y ruta | Descripción |
|---|---|
| `GET /collection` | Lista paginada con filtros combinables (ver abajo) → `{ items, total, page, pageSize, pages }` |
| `GET /collection/facets` | Valores disponibles para cada filtro, con cantidades, y rangos mínimo/máximo de precio, valor y años |
| `POST /collection` | Agrega un disco (ver abajo) → `201 { item, unlockedAchievements: [{ code, name, description, icon }], replayed }` |
| `GET /collection/:id` | Ficha completa: edición, álbum, sellos, formatos, tracklist, imágenes, valor, tags |
| `PATCH /collection/:id` | Campos de la copia (mismos que al agregar). `tags` reemplaza la lista completa |
| `DELETE /collection/:id` | Borrado lógico. Los logros ya desbloqueados se conservan |
| `POST /collection/:id/link` | `{ discogsReleaseId }` o `{ releaseId }`: vincula un disco (por ejemplo, cargado a mano sin conexión) con su edición real. Conserva precio, notas y fotos, y trae tracklist, portada y valor. La edición manual se borra si ya no la usa nada |
| `POST /collection/:id/photos/upload` | `{ contentType }` → URL prefirmada para subir una foto **de tu copia** (etiqueta, tapa gastada…) |
| `POST /collection/:id/photos` | `{ url, caption? }` registra la foto subida (máximo 10 por disco). Aparecen en `photos` de la ficha |
| `DELETE /collection/:id/photos/:photoId` | |
| `GET /collection/export.csv` | Exporta toda la colección, incluidos los campos privados, solo para su dueño |

**Filtros de `GET /collection`:** todos opcionales y combinables. Para varios valores de un mismo filtro,
repetir el parámetro (`?country=UK&country=Japan`) o separar con coma (`?country=UK,Japan`).

| Parámetro | Filtra por |
|---|---|
| `q` | Texto libre, con el mismo motor que la búsqueda global |
| `artistId` | Artista |
| `genre`, `style` | Género, estilo |
| `decade` | Década (`1970`) |
| `yearFrom`, `yearTo` | Año del álbum |
| `editionYearFrom`, `editionYearTo` | Año de la edición |
| `country`, `label` | País, sello |
| `format` | Formato: `Vinyl`, `LP`, `12"`, `Picture Disc`, `Limited Edition`… |
| `editionType` | `original`, `reissue`, `remaster`, `limited`, `promo`, `bootleg`, `compilation`, `other` |
| `condition` | Condición del disco (escala Goldmine) |
| `tag` | Tag del usuario |
| `paidMin`, `paidMax` | Precio pagado, en moneda base |
| `valueMin`, `valueMax` | Valor estimado, en moneda base |
| `sort` | `added_desc` (default), `added_asc`, `artist_asc`, `title_asc`, `year_asc`, `year_desc`, `paid_desc`, `value_desc` |
| `page`, `pageSize` | Paginación (`pageSize` default 48, máximo 200) |

"Limpiar filtros" es pedir `GET /collection` sin parámetros.

**Body de `POST /collection`:** hay que indicar **exactamente una** fuente para la edición.

```jsonc
{
  // Fuente (una sola):
  "discogsReleaseId": 1873013,          // edición elegida en la búsqueda externa o en la identificación
  // "releaseId": "uuid",               // edición que ya existe en la base (por ejemplo, otra copia)
  // "manual": {                        // carga manual
  //   "album":   { "artists": ["Pink Floyd"], "title": "…", "originalReleaseYear": 1973, "genres": [], "styles": [], "description": null },
  //   "release": { "year": 1976, "country": "Argentina", "labels": [{ "name": "EMI", "catalogNumber": "…" }],
  //                "formats": [{ "name": "Vinyl", "qty": 1, "size": "12\"", "speed": "33 ⅓ RPM", "color": null, "descriptions": ["LP"] }],
  //                "editionType": "reissue", "barcode": null, "notes": null },
  //   "tracks":  [{ "position": "A1", "title": "…", "duration": "3:45" }]
  // },

  // Datos de mi copia (todos opcionales):
  "conditionMedia": "VG+", "conditionSleeve": "VG",
  "copyNumber": "245/500", "isFirstPressing": true,
  "purchaseDate": "2026-09-20", "purchasePrice": 35000, "purchaseCurrency": "ARS",
  "purchasePlace": "Disquería X",       // privado
  "storageLocation": "Estante 2",       // privado, nunca se publica
  "notes": "…", "tags": ["favoritos"],
  "valueOverride": 80, "valueOverrideCurrency": "USD",   // valor manual (reemplaza al de mercado)
  "clientRequestId": "…"                // o el header Idempotency-Key
}
```

Si se informa un precio, su moneda es obligatoria. Las cargas manuales quedan **privadas** para quien
las hizo (`isVerified: false`).

## Wishlist ("Quiero comprar")

| Método y ruta | Descripción |
|---|---|
| `GET /wishlist?status=&includePurchased=true` | Por defecto oculta los comprados. Cada ítem trae `ownedEditions` (cuántas ediciones de ese álbum ya tenés), `market` (la copia más barata a la venta en Discogs, si se consultó) y `belowTarget` (hay una copia a tu precio objetivo o menos). El precio se actualiza una vez por día |
| `POST /wishlist` | Una sola fuente: `discogsMasterId` (cualquier edición del álbum), `discogsReleaseId` (esa edición), `albumId`, `releaseId` o `manual`. Opcionales: `targetPrice`, `targetCurrency`, `priority` (1 alta, 2 media, 3 baja), `status`, `notes`. Responde 409 si ya está en la wishlist |
| `PATCH /wishlist/:id` | `status`: `wanted` → `searching` → `found`. El estado `purchased` solo se alcanza con `/purchase` |
| `DELETE /wishlist/:id` | |
| `POST /wishlist/:id/purchase` | "Agregar a mi colección": `{ discogsReleaseId? \| releaseId?, …datos de la copia }` → crea el disco. El ítem queda `purchased` como historial. Si no se indica la edición, se usa la de la wishlist (si tenía una) |

## Catálogo, identificación y música

| Método y ruta | Descripción |
|---|---|
| `GET /catalog/external/search` | Busca en Discogs. Parámetros: `q`, `artist`, `title`, `catalogNumber`, `barcode`, `country`, `year`, `format`, `type` (`release`/`master`), `page`, `perPage` → `{ items: [candidato], page, pages, total }` |
| `GET /catalog/external/masters/:id/versions` | Todas las ediciones de un álbum, para elegir la correcta |
| `GET /catalog/external/releases/:id` | Vista previa completa de una edición de Discogs, sin importarla |
| `POST /catalog/identify/photo` | 1 a 3 fotos (portada, contratapa o etiqueta). Acepta multipart con el campo `images` o JSON `{ images: [{ data: base64, mediaType }] }` → `{ hints, strategies, candidates, remainingToday }`. **Nunca elige la edición sola**: el usuario confirma un candidato y la app llama a `POST /collection { discogsReleaseId }`. Límite diario por usuario (`VISION_DAILY_LIMIT`, default 30) |
| `POST /catalog/identify/barcode` | `{ barcode }` leído en el dispositivo. No usa IA ni consume cupo |
| `GET /catalog/releases/:id` | Ficha de una edición de la base |
| `GET /catalog/albums/:id/releases` | Otras ediciones del mismo álbum en la base |
| `GET /catalog/albums/:id/external-versions` | Todas las ediciones del álbum en Discogs ("otras ediciones"), si el álbum tiene master |
| `GET /catalog/tracks/:id/links` | `{ track, links: { spotify?, youtube? }, lyrics }`. Cada link tiene uno de estos estados: `found` (con `url`), `not_found` (con el mensaje "No encontramos este tema.") o `unavailable` (el servicio falló; conviene reintentar más tarde). Solo se muestran coincidencias verificadas. La primera vez se buscan y después quedan en caché |

## Búsqueda global, estadísticas, logros y descubrir

| Método y ruta | Descripción |
|---|---|
| `GET /search?q=&limit=` | Busca en la colección y la wishlist, con resultados agrupados: `{ artists, albums, releases, tracks }`. No distingue mayúsculas ni acentos, acepta coincidencias parciales, tolera errores de tipeo y combina palabras (`floyd money`, `emi 1973`) |
| `GET /dashboard` | `{ summary, highlights, charts }`. `summary` trae cantidad de ítems, artistas, álbumes y ediciones, lo invertido, lo estimado y la diferencia. `highlights` es "Tu colección en números" |
| `GET /stats/summary` | Solo el resumen |
| `GET /stats/breakdowns` | Distribución por artista, género, estilo, década, año, país, sello, formato, condición y tipo de edición |
| `GET /stats/timeline` | Discos agregados por mes, gasto por año y por mes, mes de mayor gasto e historial de valor |
| `GET /achievements` | Todos los logros con `unlocked`, `unlockedAt` y `progress: { current, target }` |
| `GET /achievements/essentials` | Progreso de cada discografía esencial, con los álbumes que faltan |
| `GET /discover` | Mensajes listos para mostrar, de tipo `wishlist_price_alert`, `essential_almost_complete`, `essential_complete`, `decades` y `explore_artist` (por ejemplo "Te falta 1 disco para completar Led Zeppelin.") |

## Importar desde Discogs

| Método y ruta | Descripción |
|---|---|
| `POST /imports/discogs` | `{ username? }`: una colección pública de Discogs o, sin `username`, la de tu cuenta vinculada → `202 { total, queued, status }`. Valida el usuario al instante (404 si no existe, 403 si su colección es privada); el resto de las páginas se lista en segundo plano |
| `POST /imports/discogs/run` | Procesa un lote de 10 discos. El cliente lo llama en bucle y muestra el progreso con `status: { pending, done, failed, listing }`. Termina cuando `pending = 0` y `listing = false` |
| `GET /imports/discogs` | Estado de la importación |

Volver a importar la misma colección no duplica discos y reintenta los que habían fallado.

## Público (sin sesión, base para la V2)

| Método y ruta | Descripción |
|---|---|
| `GET /public/users/:username` | Perfil público. Responde 404 si el perfil es privado |
| `GET /public/users/:username/collection` | Solo si la colección es pública. Nunca incluye lugar de compra ni ubicación física. Los precios y valores aparecen solo si el dueño los habilitó. Acepta los filtros de la colección salvo `tag`; los filtros y ordenamientos por precio o valor solo funcionan si el dueño los hizo públicos |
| `GET /public/users/:username/wishlist` | Solo si la wishlist es pública |

## Operación

| Método y ruta | Descripción |
|---|---|
| `GET /health` | `{ ok: true }` |
| `GET\|POST /cron/maintenance` | Requiere `Authorization: Bearer $CRON_SECRET`. Refresca valores de mercado viejos, reintenta conversiones de moneda fallidas y guarda los snapshots diarios de valor |
