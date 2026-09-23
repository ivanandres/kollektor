# ADR 0001 — Plataforma móvil y despliegue

- **Estado:** aceptada
- **Fecha:** 2026-09-23

## Contexto

- El lanzamiento inicial es para uso personal, en Vercel.
- Más adelante se quiere migrar a un VPS para tener un costo fijo y bajo.
- Eventualmente la app tiene que publicarse en **App Store (iOS)** y **Google Play (Android)**.
- El caso de uso crítico es móvil: "estoy en una disquería, escaneo un disco y lo registro".

## Opciones evaluadas para iOS/Android

| Opción | Publicable en tiendas | Cámara / código de barras | Reutilización con la web | Veredicto |
|---|---|---|---|---|
| **PWA sola** | Android: sí (TWA). iOS: **no** de forma fiable. Apple rechaza apps que son solo una web envuelta (guideline 4.2). | En iOS Safari no existe `BarcodeDetector`; se depende de `zxing-wasm`, más lento. | 100% | Sirve para el MVP, no como destino final. |
| **Capacitor** (envolver la web) | Sí | Con plugins nativos (ML Kit) es buena | ~90% de la UI | Choca con Next.js SSR: requiere exportar la web como SPA estática. La UX sigue siendo "web en un contenedor". Riesgo de rechazo en iOS si aporta poco nativo. |
| **Expo / React Native** | Sí (builds con EAS) | Nativa y excelente (`expo-camera` escanea EAN/UPC en tiempo real) | Tipos, validaciones, cliente de API, hooks de datos y tokens de diseño. La UI se escribe aparte. | **Elegida.** |
| **Flutter** | Sí | Excelente | Nula: otro lenguaje (Dart) y otro cliente de API | Descartada: duplica todo lo que no es backend. |
| **Solo Expo** (Expo Router también para web) | Sí | Excelente | Una sola UI | Descartada por ahora: la web de escritorio (estadísticas, filtros, tablas) y el SSR de perfiles públicos quedan mejor en Next.js. Se puede revisar más adelante. |

## Decisión

1. **API-first en un monorepo** (pnpm + Turborepo):
   - `apps/api` (Hono).
   - `apps/web` (Next.js).
   - `apps/mobile` (Expo), que se crea después del MVP.
   - `packages/*` compartidos: dominio, DB, Zod, integraciones y cliente de API.
2. **La lógica de negocio vive en `packages/core`** y se expone solo por HTTP. Next.js no usa Server Actions para lógica de dominio, porque la app móvil no podría llamarlas.
3. **Auth con Better Auth:**
   - Web: sesiones por cookie.
   - Móvil: token guardado en almacenamiento seguro (integración oficial para Expo).
   - La misma tabla de usuarios para ambos.
4. **Portabilidad Vercel → VPS:**
   - No se usan servicios propietarios de Vercel (KV, Blob, Edge Config, Vercel Postgres).
   - La API y la web tienen Dockerfile desde la Fase 1. `docker-compose.yml` sirve para desarrollo local y es la base de producción en el VPS.
   - Los jobs viven en una tabla de Postgres y se disparan por HTTP/cron: hoy Vercel Cron, mañana el cron del sistema o un worker en el VPS.
   - Imágenes en R2 (compatible con S3), independiente del hosting.
   - La migración queda en: `pg_dump`/`pg_restore` de Neon al Postgres del VPS, variables de entorno y DNS.

## Consecuencias

- **+** Una sola API y un solo modelo de datos para web, iOS y Android.
- **+** Escáner nativo en el teléfono, que es el caso de uso principal.
- **+** Cambiar de hosting no toca el código.
- **−** Más estructura inicial que un Next.js solo: monorepo y API separada. Es un costo acotado en la Fase 1.
- **−** La UI móvil se escribe dos veces (web y React Native). Se mitiga compartiendo tokens de diseño, hooks y cliente.
- **−** En Vercel, la API corre como función aparte. Hay que configurar CORS y cookies entre `app.` y `api.`, o servir la API bajo `/api` del mismo dominio mediante rewrites (preferido).

## Costos de publicación

- Apple Developer Program: USD 99 por año.
- Google Play Console: USD 25, pago único.
- EAS Build tiene un plan gratuito con builds limitados. Alternativa: builds locales (iOS requiere macOS).
