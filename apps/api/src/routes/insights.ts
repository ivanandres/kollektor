import { Hono } from 'hono';
import { searchQuery } from '@kollektor/schemas';
import { parse, queryObject } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

export function insightRoutes({ core }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/search', async (c) => {
      const q = parse(searchQuery, queryObject(c));
      return c.json(await core.search.search(c.get('userId'), q.q, q.limit));
    })
    .get('/dashboard', async (c) => c.json(await core.stats.dashboard(c.get('userId'))))
    .get('/stats/summary', async (c) => c.json(await core.stats.summary(c.get('userId'))))
    .get('/stats/breakdowns', async (c) => c.json(await core.stats.breakdowns(c.get('userId'), 50)))
    .get('/stats/timeline', async (c) => c.json(await core.stats.timeline(c.get('userId'))))
    .get('/achievements', async (c) =>
      c.json(await core.achievements.listWithProgress(c.get('userId'))),
    )
    .get('/achievements/essentials', async (c) =>
      c.json(await core.achievements.essentialProgress(c.get('userId'))),
    )
    .get('/discover', async (c) => c.json(await core.discovery.insights(c.get('userId'))));
}
