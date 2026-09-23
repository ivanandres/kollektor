import { Hono } from 'hono';
import { achievementPatch, essentialListInput } from '@kollektor/core';
import { jsonBody, parse } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

const CODE = '[a-z0-9-]{2,60}';

/** Curation endpoints. Only for user ids listed in ADMIN_USER_IDS. */
export function adminRoutes({ core, env }: AppDeps) {
  const admins = new Set(
    (env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean),
  );
  return new Hono<AppEnv>()
    .use('*', async (c, next) => {
      if (!admins.has(c.get('userId')))
        return c.json({ error: { code: 'FORBIDDEN', message: 'Solo para administradores' } }, 403);
      await next();
    })
    .get('/essential-lists', async (c) => c.json(await core.admin.listEssentials()))
    .put(`/essential-lists/:code{${CODE}}`, async (c) =>
      c.json(
        await core.admin.upsertEssential(
          c.req.param('code'),
          parse(essentialListInput, await jsonBody(c)),
        ),
      ),
    )
    .delete(`/essential-lists/:code{${CODE}}`, async (c) => {
      await core.admin.deleteEssential(c.req.param('code'));
      return c.body(null, 204);
    })
    .get('/achievements', async (c) => c.json(await core.admin.listAchievements()))
    .patch(`/achievements/:code{${CODE}}`, async (c) =>
      c.json(
        await core.admin.updateAchievement(
          c.req.param('code'),
          parse(achievementPatch, await jsonBody(c)),
        ),
      ),
    );
}
