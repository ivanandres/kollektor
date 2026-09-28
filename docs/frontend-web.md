# Frontend web (Fase 12)

`apps/web` implementa los mockups del handoff de Claude Design (`design/`, archivo
`Kolektorz Mockups.dc.html`) con el sistema **Modernist**: Archivo, un único rojo de acento,
esquinas rectas y reglas de 2px. Es una app Next.js 16 que funciona como PWA y consume la API
con `@kollektor/api-client`.

## Cómo está armada

- **Un solo código para teléfono y escritorio.** Debajo de 960px se muestran los diseños mobile
  (390 × 844) y arriba los de web (1280). `src/lib/responsive.tsx` monta solo el layout que
  corresponde, sin duplicar pedidos.
- **Datos reales desde el arranque.** React Query sobre el cliente tipado; `/api/*` se reenvía a la
  API (`API_URL`) para que la cookie de sesión sea del mismo dominio.
- **Design system.** `src/styles/modernist.css` es copia literal del `styles.css` del handoff. La
  fuente Archivo se sirve desde el propio sitio (`@fontsource/archivo`) con los mismos pesos
  (400/600/800), para no depender de Google Fonts y para que funcione offline.
- **Filtros en la URL.** `/coleccion?genre=Rock&decade=1970…`: se pueden compartir y sobreviven una
  recarga.
- **PWA.** `app/manifest.ts`, íconos y `public/sw.js`. El service worker guarda el shell de la app
  y la última respuesta de cada consulta. Sin conexión se ve lo último cargado y la sesión no se
  cierra. Al cerrar sesión se borra esa caché.

## Pantallas

| Mockup                       | Ruta                                  | Notas                                                                                          |
| ---------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1a Login / registro          | `/login`, `/restablecer`              | Recuperar contraseña por mail                                                                  |
| 1b Dashboard A (números)     | `/` (mobile)                          | Elegible desde Perfil → Preferencias → "Inicio en el teléfono: Números"                        |
| 1c Dashboard B (progreso)    | `/` (mobile, **default**)             | El bloque rojo muestra la discografía esencial más cerca de completarse                       |
| 1d Colección grid / lista    | `/coleccion` (mobile)                 | Tercer botón del toggle: estante                                                               |
| 1e Estante de lomos          | `/coleccion` vista "estante"          | A–Z por artista ignorando "The"; tocar un lomo muestra la vista previa y tocarla abre la ficha |
| 1f Buscador + filtros        | `/buscar`                             | La hoja de filtros también se abre desde Colección                                            |
| 1g Identificar con cámara    | `/agregar`                            | Cámara trasera, foto → IA, código de barras (lector nativo o ZXing en iOS), búsqueda por texto |
| 1h Agregar manualmente       | `/agregar/manual`                     | Borrador guardado en el dispositivo; aviso "Sin conexión"                                      |
| 1i / 1n Ficha                | `/coleccion/[id]`                     | Links de cada tema buscados a demanda (tocar el tema en mobile, pasar el mouse en web)         |
| 1j Wishlist                  | `/wishlist`                           | Tocar un disco: estado, prioridad, precio objetivo, "Lo compré"                                |
| 1k Dashboard web             | `/` (web)                             |                                                                                                |
| 1l Colección web             | `/coleccion` (web)                    | Sidebar de facetas con cantidades, grid 5 columnas o tabla                                    |
| 1m Buscador ⌘K               | modal global (web)                    | ⌘K / Ctrl+K o la caja de la barra superior                                                     |
| — (sin mockup)               | `/coleccion/[id]/editar`              | Editar la copia, sumar fotos, borrar                                                           |
| — (sin mockup)               | `/u/[username]`                       | Perfil público sin sesión: colección y wishlist según la privacidad del dueño                 |
| — (sin mockup)               | `/estadisticas`, `/logros`, `/perfil` | Mismo lenguaje visual que 1b/1k/1h; en mobile se llega desde Perfil                            |

## Decisiones tomadas sin consultarte (fáciles de cambiar)

- **Variantes:** no elegiste entre 1b/1c ni entre 1d/1e, así que están todas. El Inicio mobile
  arranca en **1c** y se cambia a 1b desde Perfil. La colección arranca en **grid (1d)**; lista y
  estante (1e) están en el mismo toggle y la app recuerda la última vista.
- **Barra de estado "9:41":** es del mockup; en el teléfono la pone el sistema, así que no se dibuja.
  Las pantallas respetan el notch (`safe-area-inset`).
- **Portadas:** imagen real cuando hay; si no, el placeholder rayado del mockup.
- **Condiciones en los selectores:** las 6 del diseño (M, NM, VG+, VG, G, P). La API acepta además G+
  y F (por ejemplo, desde importaciones), y se muestran igual.
- **Wishlist:** en el diseño, "Agregar a mi colección" aparece en la pestaña Comprado. En la API,
  "comprado" significa que ya está en la colección, así que el botón está en **Encontrado** (y en
  la hoja de cada disco). En Comprado queda "Ver en mi colección".
- **Links de temas en la ficha web:** se buscan al pasar el mouse para no gastar la cuota de
  YouTube abriendo cada ficha.
- **Web de la ficha y de la colección:** como en 1l/1n, la barra superior no muestra la caja de
  búsqueda (⌘K sigue funcionando).
- **Cambios en la API:** la lista de la colección ahora trae `label` y `catalogNumber` (para "país ·
  sello" en 1l) y acepta el filtro `albumId` (para abrir un álbum desde la búsqueda).

## Cómo correrla

```bash
pnpm --filter @kollektor/api dev   # :3001
pnpm --filter @kollektor/web dev   # :3000 → entrar con demo@kollektor.app / vinilos-demo
```

Sin claves externas funcionan la carga manual, la colección, la búsqueda, las estadísticas y los
logros. La identificación por foto, la búsqueda en Discogs y los links de música muestran un aviso
hasta que se configuren sus variables (ver README).

## Tests

- Lógica pura (formatos, filtros, montos, carga manual, redirect del login): Vitest, dentro de `pnpm test`.
- De punta a punta con Playwright (`pnpm --filter @kollektor/web e2e`), en mobile y en web: registro y
  login, rutas privadas, carga manual (alta, edición, borrado, borrador), filtros y búsqueda, vistas
  lista/estante/tabla, wishlist hasta "Lo compré", perfil público y privacidad, e Inicio/Estadísticas/
  Logros/Perfil sin errores. Corren en CI en un job aparte.

## Pendiente / ideas

- Nada crítico por ahora; ver la lista de próximos pasos en el README.
