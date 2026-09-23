import { Hono } from 'hono';
import { z } from 'zod';
import {
  addToWishlistInput,
  collectionItemFields,
  updateWishlistInput,
  wishlistQuery,
} from '@kollektor/schemas';
import { jsonBody, parse, queryObject } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

const purchaseInput = collectionItemFields.extend({
  releaseId: z.uuid().optional(),
  discogsReleaseId: z.coerce.number().int().positive().optional(),
});

export function wishlistRoutes({ core }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/', async (c) =>
      c.json(await core.wishlist.list(c.get('userId'), parse(wishlistQuery, queryObject(c)))),
    )
    .post('/', async (c) =>
      c.json(
        await core.wishlist.add(c.get('userId'), parse(addToWishlistInput, await jsonBody(c))),
        201,
      ),
    )
    .patch('/:id{[0-9a-f-]{36}}', async (c) =>
      c.json(
        await core.wishlist.update(
          c.get('userId'),
          c.req.param('id'),
          parse(updateWishlistInput, await jsonBody(c)),
        ),
      ),
    )
    .delete('/:id{[0-9a-f-]{36}}', async (c) => {
      await core.wishlist.remove(c.get('userId'), c.req.param('id'));
      return c.body(null, 204);
    })
    .post('/:id{[0-9a-f-]{36}}/purchase', async (c) => {
      const input = parse(purchaseInput, await jsonBody(c));
      const r = await core.wishlist.purchase(c.get('userId'), c.req.param('id'), input);
      return c.json(
        { ...r, unlockedAchievements: await core.achievements.getByCodes(r.unlockedAchievements) },
        201,
      );
    });
}
