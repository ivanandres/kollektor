import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { errorResponse } from './lib/http';
import { catalogRoutes } from './routes/catalog';
import { collectionRoutes } from './routes/collection';
import { insightRoutes } from './routes/insights';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
import { discogsAccountRoutes, discogsCallbackRoutes } from './routes/discogs';
import { perUserRateLimit } from './lib/rate-limit';
import { accessLog } from './lib/log';
import { wishlistRoutes } from './routes/wishlist';
import type { AppDeps, AppEnv } from './types';

export function createApp(deps: AppDeps) {
  const { auth, core, env } = deps;
  const app = new Hono<AppEnv>().basePath('/api');

  app.use('*', requestId());
  if (env.NODE_ENV !== 'test') app.use('*', accessLog());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: env.WEB_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
      allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['set-auth-token'],
    }),
  );
  app.onError(errorResponse);
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }, 404));

  app.get('/health', (c) => c.json({ ok: true }));
  app.on(['GET', 'POST'], '/auth/*', (c) => auth.handler(c.req.raw));

  // Cron (Vercel Cron sends GET with Authorization: Bearer $CRON_SECRET; a VPS crontab can do the same).
  app.on(['GET', 'POST'], '/cron/maintenance', async (c) => {
    if (!env.CRON_SECRET || c.req.header('authorization') !== `Bearer ${env.CRON_SECRET}`)
      return c.json({ error: { code: 'FORBIDDEN', message: 'No autorizado' } }, 401);
    await core.scheduleMaintenance();
    return c.json(await core.runJobs(40, 45_000));
  });

  app.route('/public', publicRoutes(deps));
  app.route('/discogs', discogsCallbackRoutes(deps));

  // Everything below requires a session (cookie on web, bearer token on mobile).
  const authed = new Hono<AppEnv>();
  authed.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session)
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Iniciá sesión para continuar' } },
        401,
      );
    c.set('userId', session.user.id);
    await next();
  });
  const limit = perUserRateLimit(env.EXTERNAL_RATE_LIMIT_PER_MIN);
  authed.use('/catalog/external/*', limit);
  authed.use('/catalog/identify/*', limit);
  authed.use('/imports/*', limit);
  authed.use('/catalog/albums/:id/external-versions', limit);
  authed.use('/me/avatar-upload', limit);
  authed.use('/collection/:id/photos/upload', limit);
  authed.use('/me/discogs/connect', limit);
  authed.route('/me/discogs', discogsAccountRoutes(deps));
  authed.route('/me', meRoutes(deps));
  authed.route('/collection', collectionRoutes(deps));
  authed.route('/wishlist', wishlistRoutes(deps));
  authed.route('/catalog', catalogRoutes(deps));
  authed.route('/', insightRoutes(deps));
  app.route('/', authed);

  return app;
}

export type App = ReturnType<typeof createApp>;
