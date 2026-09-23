import type { Context, MiddlewareHandler } from 'hono';

/**
 * One JSON line per request (method, path, status, duration, request id, user). Works with
 * Vercel logs and any log shipper on a VPS. Never logs bodies, query strings or tokens.
 */
export function accessLog(): MiddlewareHandler {
  return async (c, next) => {
    const started = performance.now();
    await next();
    const line = {
      level: c.res.status >= 500 ? 'error' : 'info',
      msg: 'request',
      requestId: c.get('requestId'),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
      userId: (c.get as (k: string) => unknown)('userId') ?? undefined,
    };
    console.log(JSON.stringify(line));
  };
}

export function logError(c: Context, err: unknown) {
  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled error',
      requestId: c.get('requestId'),
      path: new URL(c.req.url).pathname,
      error:
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : String(err),
    }),
  );
}
