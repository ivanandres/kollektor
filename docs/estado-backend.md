# Estado del backend — noche del 23/09/2026

Resumen: el backend del MVP (fases 1 a 11 del roadmap) está implementado, con 93 tests pasando contra
Postgres real. Falta todo lo visual: web (fase 12, espera las pantallas de diseño) y app móvil (fase 13).

## Por fase

| Fase | Qué quedó | Dónde |
|---|---|---|
| 1. Setup + arquitectura + DB | Monorepo pnpm/Turborepo, TS estricto, esquema completo (35 tablas) con migraciones, `pg_trgm` + `unaccent`, Vitest, ESLint, Prettier, CI de GitHub Actions, Docker y config de Vercel | `packages/db`, `.github/workflows/ci.yml` |
| 2. Auth + usuarios | Registro, login, logout, recuperación de contraseña por mail, sesión por cookie (web) o bearer (mobile). Perfil con username único, bio, avatar (subida prefirmada a R2/S3) y privacidad granular, **privado por default**. Borrado de cuenta con todos sus datos | `apps/api/src/auth.ts`, `modules/profiles` |
| 3. Artistas / álbumes / ediciones / temas | Modelo por edición: varios artistas por álbum, varios sellos y catálogos por edición, formatos estructurados (cantidad, tamaño, velocidad, color, descripciones), tracklist por lado, ids externos genéricos | `modules/catalog` |
| 4. Colección | Alta, edición, baja lógica, tags, condición Goldmine, número de copia, precio en cualquier moneda convertido a la moneda base según la fecha de compra, valor estimado con fuente, fotos de la copia propia, export CSV | `modules/collection`, `modules/currency`, `modules/valuation` |
| 5. Discogs | `DiscogsService` con rate limit (55/min), reintentos ante 429/5xx, búsqueda por texto, artista, título, catálogo, código de barras, país, año y formato. Ediciones de un master, importación idempotente y segura ante concurrencia, valores de mercado por condición con fallback, importación de colección pública | `packages/integrations/src/discogs`, `modules/imports` |
| 6. Agregar vinilo | Manual (queda privada del usuario), desde Discogs y por foto: código de barras → catálogo → artista/título con Claude visión, siempre devolviendo **candidatos** para confirmar. Altas idempotentes para conexiones malas | `modules/recognition`, `integrations/src/vision` |
| 7. Wishlist | Por álbum (cualquier edición) o por edición específica, prioridad, precio objetivo, estados, "Agregar a mi colección" que conserva el historial | `modules/wishlist` |
| 8. Búsqueda + filtros | Búsqueda global agrupada (artistas, álbumes, ediciones, temas) tolerante a errores de tipeo. 17 filtros combinables con facetas, 8 ordenamientos, paginación | `modules/search`, `modules/collection/queries.ts` |
| 9. Ficha + tracklist + links | Ficha completa con otras ediciones del álbum. Links de Spotify/YouTube y "Ver letra" (Genius): solo coincidencias verificadas, buscados la primera vez que se piden y cacheados | `modules/music`, `integrations/src/{spotify,youtube,lyrics}` |
| 10. Dashboard + estadísticas | Totales, invertido vs. estimado, "Tu colección en números", 10 distribuciones, línea de tiempo de compras e historial de valor (snapshots diarios) | `modules/stats` |
| 11. Logros + descubrir | Motor de reglas declarativo (conteos, diversidad, décadas, países, rarezas, discografías completas), 30 logros sembrados, 7 discografías esenciales curadas, mensajes de "descubrir" | `modules/achievements`, `modules/discovery`, `seed/` |

También quedó un **cliente tipado** (`packages/api-client`) que usan igual la web y la app móvil: tipos
derivados del dominio, sesión por cookie o token, errores con mensajes en español y altas seguras ante
reintentos.

También quedó una base para la V2 social: vistas públicas con proyecciones explícitas de privacidad y la
tabla `activity_events`, que ya registra cada alta, compra y logro.

## Cómo probarlo sin frontend

```bash
pnpm db:migrate && pnpm db:seed && pnpm db:seed:demo
pnpm --filter @kollektor/api dev
# login: demo@kollektor.app / vinilos-demo
```

Las respuestas reales de cada pantalla están en [`api-examples/`](api-examples/): dashboard, colección,
ficha, búsqueda "love", wishlist, estadísticas, logros y descubrir. **Sirven como datos de referencia
para el diseño.**

## Decisiones que tomé durante la implementación

1. **TypeScript 6.0**, no 7.0: la 7 (el compilador nativo) todavía no es compatible con typescript-eslint.
2. **Drizzle + SQL explícito** para búsqueda, filtros y estadísticas: es más fácil de leer y optimizar que un ORM mágico.
3. **Los puertos (interfaces) viven en el core** y las integraciones los implementan. Es un ajuste menor respecto del documento de análisis.
4. **Modelo de visión:** por defecto `claude-opus-5`, configurable con `VISION_MODEL`. Costo aproximado de
   **USD 0,03 a 0,08 por identificación** con 1–3 fotos, más de lo que estimé antes para un modelo chico.
   Con `VISION_MODEL=claude-haiku-4-5` baja unas 5 veces. Conviene medir la precisión de los dos con fotos
   reales antes de elegir. El código de barras se lee en el teléfono y no cuesta nada.
5. **Logros:** no se revocan al borrar discos. Las **discografías esenciales** cuentan cualquier edición del
   álbum, aunque sea una carga manual, comparando título normalizado y artista, con alias para casos como
   "Led Zeppelin IV" = "Untitled".
6. **"Primera edición":** usa la marca manual del usuario, o la heurística "edición original" solo cuando
   Discogs informa el master y el año coincide.
7. **Monedas:** la base por default es USD. ARS se convierte con la cotización de la fecha de compra
   (currency-api, porque Frankfurter no tiene ARS). Si el proveedor no responde, se reintenta en el
   mantenimiento diario.
8. **Búsqueda:** cubre la colección más la wishlist del usuario. La búsqueda en Discogs es un endpoint
   aparte, para el flujo de "Agregar".
9. **Estadísticas:** "vinilos" cuenta copias, así que un 2×LP cuenta como 1.

## Rendimiento medido

Colección sintética de 5.000 discos (3.000 álbumes, 6.000 ediciones, 54.000 temas), Postgres 16 local:

| Operación | Tiempo |
|---|---|
| Listar colección (default, filtros combinados, orden por artista) | 3–41 ms |
| Facetas de filtros | ~50 ms |
| Dashboard completo | ~70 ms |
| Búsqueda global, consultas realistas ("love", "cat-12", "artist a1") | 120–350 ms |
| Búsqueda global, peor caso sintético (todos los títulos coinciden) | ~700 ms |

Si las colecciones crecen mucho más, el paso natural es un índice de búsqueda dedicado detrás del
mismo `SearchProvider` (Meilisearch o Typesense), sin tocar la API.

## Limitaciones conocidas / pendientes

- **Valor de mercado:** la sugerencia de precio por condición de Discogs requiere que la cuenta del token
  tenga configurado el perfil de vendedor. Sin eso se usa el precio publicado más bajo, que es una señal
  más débil y queda marcada como tal (`estimate.kind = "lowest"`).
- **Spotify:** verificar que la app de Spotify tenga acceso a la búsqueda con las políticas vigentes.
  Si no, el link queda como `unavailable`, nunca como un link inventado.
- **Rate limit por usuario:** es en memoria, por instancia. Alcanza para el MVP; con varias instancias
  conviene moverlo a Postgres o Redis.
- **Discogs OAuth por usuario** (colecciones privadas y más cupo): no está hecho. Hoy la importación
  funciona con colecciones públicas.
- **Deploy:** la configuración de Vercel y Docker está escrita pero no pude probarla en este entorno (no hay
  Docker ni cuenta de Vercel). Hay que validarla en el primer deploy.
- Los **tipos de cambio** y las **APIs externas reales** no se pudieron llamar desde este entorno, porque la
  red del sandbox bloquea esos hosts. Los adaptadores están testeados con respuestas simuladas.

## Próximos pasos sugeridos

1. Diseño de las pantallas clave, que el backend ya soporta: Inicio, Colección (grid y lista con filtros),
   Agregar (búsqueda, foto, manual y confirmación de edición), Ficha, Wishlist, Estadísticas, Logros y Perfil.
2. Fase 12: `apps/web` (Next.js) consumiendo esta API, con PWA, cámara y borradores offline en IndexedDB.
3. Cargar credenciales reales (Discogs, Anthropic, Spotify, YouTube, Genius, Resend, R2) y probar con discos reales.
4. Primer deploy en Vercel + Neon.
