import { Hono } from 'hono';
import {
  addToCollectionInput,
  collectionQuery,
  updateCollectionItemInput,
} from '@kollektor/schemas';
import { jsonBody, parse, queryObject } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

export function collectionRoutes({ core }: AppDeps) {
  const withAchievements = async <T extends { unlockedAchievements: string[] }>(r: T) => ({
    ...r,
    unlockedAchievements: await core.achievements.getByCodes(r.unlockedAchievements),
  });
  return new Hono<AppEnv>()
    .get('/', async (c) =>
      c.json(await core.collection.list(c.get('userId'), parse(collectionQuery, queryObject(c)))),
    )
    .get('/facets', async (c) => c.json(await core.collection.facets(c.get('userId'))))
    .post('/', async (c) => {
      const input = parse(addToCollectionInput, await jsonBody(c));
      return c.json(await withAchievements(await core.collection.add(c.get('userId'), input)), 201);
    })
    .get('/:id{[0-9a-f-]{36}}', async (c) =>
      c.json(await core.collection.get(c.get('userId'), c.req.param('id'))),
    )
    .patch('/:id{[0-9a-f-]{36}}', async (c) => {
      const input = parse(updateCollectionItemInput, await jsonBody(c));
      return c.json(
        await withAchievements(
          await core.collection.update(c.get('userId'), c.req.param('id'), input),
        ),
      );
    })
    .delete('/:id{[0-9a-f-]{36}}', async (c) => {
      await core.collection.remove(c.get('userId'), c.req.param('id'));
      return c.body(null, 204);
    });
}
