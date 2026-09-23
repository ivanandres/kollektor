import { Hono } from 'hono';
import { profileUpdateInput, username } from '@kollektor/schemas';
import { jsonBody, parse } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

export function meRoutes({ core }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/profile', async (c) => c.json(await core.profiles.getProfile(c.get('userId'))))
    .patch('/profile', async (c) => {
      const input = parse(profileUpdateInput, await jsonBody(c));
      return c.json(await core.profiles.updateProfile(c.get('userId'), input));
    })
    .get('/username-available', async (c) => {
      const u = parse(username, c.req.query('username') ?? '');
      return c.json({ username: u, available: await core.profiles.isUsernameAvailable(u, c.get('userId')) });
    });
}
