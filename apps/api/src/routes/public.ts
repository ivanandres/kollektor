import { Hono } from 'hono';
import { collectionQuery } from '@kollektor/schemas';
import { parse, queryObject } from '../lib/http';
import type { AppDeps } from '../types';

/** Unauthenticated, read-only views of profiles their owners made public. */
export function publicRoutes({ core }: AppDeps) {
  return new Hono()
    .get('/users/:username', async (c) =>
      c.json(await core.publicViews.profile(c.req.param('username'))),
    )
    .get('/users/:username/collection', async (c) =>
      c.json(
        await core.publicViews.collectionOf(
          c.req.param('username'),
          parse(collectionQuery, queryObject(c)),
        ),
      ),
    )
    .get('/users/:username/wishlist', async (c) =>
      c.json(await core.publicViews.wishlistOf(c.req.param('username'))),
    );
}
