import { Hono } from 'hono';
import { searchQuery } from '@kollektor/schemas';
import { z } from 'zod';
import { jsonBody, parse, queryObject } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

export function insightRoutes({ core }: AppDeps) {
  return (
    new Hono<AppEnv>()
      .get('/search', async (c) => {
        const q = parse(searchQuery, queryObject(c));
        return c.json(await core.search.search(c.get('userId'), q.q, q.limit));
      })
      .get('/dashboard', async (c) => c.json(await core.stats.dashboard(c.get('userId'))))
      .get('/stats/summary', async (c) => c.json(await core.stats.summary(c.get('userId'))))
      .get('/stats/breakdowns', async (c) =>
        c.json(await core.stats.breakdowns(c.get('userId'), 50)),
      )
      .get('/stats/timeline', async (c) => c.json(await core.stats.timeline(c.get('userId'))))
      .get('/achievements', async (c) =>
        c.json(await core.achievements.listWithProgress(c.get('userId'))),
      )
      .get('/achievements/essentials', async (c) =>
        c.json(await core.achievements.essentialProgress(c.get('userId'))),
      )
      .get('/discover', async (c) => c.json(await core.discovery.insights(c.get('userId'))))
      // Import an existing public Discogs collection: start, then poll `run` to process batches.
      .post('/imports/discogs', async (c) => {
        const { username } = parse(
          // Optional when the user linked their Discogs account (then their own, even private).
          z.object({ username: z.string().trim().min(1).max(100).optional() }),
          await jsonBody(c),
        );
        return c.json(await core.imports.startDiscogsImport(c.get('userId'), username), 202);
      })
      .get('/imports/discogs', async (c) => c.json(await core.imports.status(c.get('userId'))))
      .post('/imports/discogs/run', async (c) =>
        c.json(await core.imports.runBatch(c.get('userId'), 10)),
      )
  );
}
