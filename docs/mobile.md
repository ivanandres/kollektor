# App móvil (Fase 13)

`apps/mobile` es la app nativa para iOS y Android, hecha con **Expo SDK 57** y Expo Router.
Reproduce las pantallas mobile del handoff (390 × 844) con el mismo sistema Modernist, y habla con
la misma API que la web.

## Cómo está armada

- **Sesión:** token bearer que la API devuelve en `set-auth-token`, guardado en SecureStore. Sin
  cookies ni header `Origin`.
- **Datos:** los mismos hooks que la web. `@kollektor/app-logic` exporta `createQueries(api, ReactQuery)`
  y la lógica pura (formatos, filtros, logros, carga manual, ficha). Cada app le pasa su propia copia de
  React Query, porque pnpm instala una por versión de React.
- **Diseño:** tokens en `src/lib/theme.ts`, Archivo 400/600/800 con `@expo-google-fonts/archivo`, y el
  placeholder rayado de las portadas dibujado con `react-native-svg`.
- **Cámara:** `expo-camera` para la foto de la portada y la lectura nativa de códigos de barras
  (EAN/UPC), `expo-image-picker` para subir fotos y `expo-image-manipulator` para achicarlas antes de
  identificarlas.
- **Borradores:** la carga manual se guarda en AsyncStorage mientras escribís.

## Pantallas

| Diseño                         | Ruta                                  |
| ------------------------------ | ------------------------------------- |
| 1a Login / registro            | `login`                               |
| 1c / 1b Inicio                 | `(tabs)/index` (se elige en Perfil)   |
| 1d / 1e Colección y estante    | `(tabs)/coleccion`                    |
| 1f Buscador + filtros          | `buscar` y hoja de filtros            |
| 1g Identificar con cámara      | `agregar` (también wishlist, vincular y otras ediciones) |
| 1h Agregar manualmente         | `agregar/manual`                      |
| 1i Ficha                       | `coleccion/[id]`, `coleccion/[id]/editar` |
| 1j Wishlist                    | `(tabs)/wishlist`                     |
| Logros, Perfil                 | `logros`, `(tabs)/perfil`             |

Las estadísticas completas y la importación de Discogs/CSV se abren en la web desde Perfil. Borrar
la cuenta se puede hacer dentro de la app, como exige el App Store.

## Correrla

```bash
cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_API_URL (en el teléfono: la IP de tu compu)
pnpm --filter @kollektor/api dev
pnpm --filter @kollektor/mobile start           # Expo Go o un development build
```

La API tiene que ser accesible desde el teléfono: usá la IP local (`http://192.168.x.x:3001/api`) o un
túnel. La cámara necesita un dispositivo real.

Builds de tienda con EAS: `npx eas-cli@latest build --profile production` (ver `eas.json`; completá
las URLs de producción).

## Qué se verificó y qué no

- Typecheck, lint y bundle (`expo export --platform web`, también en CI).
- Las pantallas se revisaron renderizadas con react-native-web contra la API y los datos demo, y el
  alta manual se probó de punta a punta.
- Todavía **no** se probó en un iPhone o Android real ni en simuladores: la cámara, SecureStore y los
  permisos solo existen ahí.
