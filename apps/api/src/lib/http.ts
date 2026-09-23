import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError, type z } from 'zod';
import { DomainError, type ErrorCode } from '@kollektor/core';
import { logError } from './log';

const STATUS: Record<ErrorCode, 400 | 403 | 404 | 409 | 429 | 502 | 503> = {
  VALIDATION: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UPSTREAM_UNAVAILABLE: 502,
  NOT_CONFIGURED: 503,
};

export function errorResponse(err: unknown, c: Context) {
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Datos inválidos',
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      400,
    );
  }
  if (err instanceof DomainError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      STATUS[err.code],
    );
  }
  if (err instanceof HTTPException) return err.getResponse();
  logError(c, err);
  // Upstream HTTP errors (Discogs, etc.) surface as 502 without leaking internals.
  if (err instanceof Error && err.name === 'HttpError') {
    return c.json(
      {
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'El servicio externo no respondió. Probá de nuevo.',
        },
      },
      502,
    );
  }
  return c.json({ error: { code: 'INTERNAL', message: 'Error inesperado' } }, 500);
}

export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> =>
  schema.parse(data);

/** Hono query → object where repeated keys become arrays. */
export function queryObject(c: Context): Record<string, string | string[]> {
  const all = c.req.queries();
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length === 1 ? v[0]! : v]));
}

export async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new DomainError('VALIDATION', 'El cuerpo debe ser JSON válido');
  }
}
