import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';

/**
 * Per-user fixed-window limiter (in memory, per instance). Protects the shared Discogs quota
 * and paid vision calls from a single noisy client. For multi-instance deployments swap the
 * Map for Postgres/Redis.
 */
export function perUserRateLimit(perMinute: number): MiddlewareHandler<AppEnv> {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const key = c.get('userId');
    const now = Date.now();
    const w = windows.get(key);
    if (!w || now - w.start >= 60_000) windows.set(key, { start: now, count: 1 });
    else if (++w.count > perMinute) {
      c.header('Retry-After', String(Math.ceil((w.start + 60_000 - now) / 1000)));
      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Demasiadas búsquedas seguidas. Esperá un momento.',
          },
        },
        429,
      );
    }
    if (windows.size > 10_000)
      for (const [k, v] of windows) if (now - v.start >= 60_000) windows.delete(k);
    await next();
  };
}
