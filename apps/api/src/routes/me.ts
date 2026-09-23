import { Hono } from 'hono';
import { z } from 'zod';
import { profileUpdateInput, username } from '@kollektor/schemas';
import { jsonBody, parse } from '../lib/http';
import { IMAGE_TYPES, requireStorage, verifyUploadedImage, type ImageType } from '../lib/uploads';
import type { AppDeps, AppEnv } from '../types';

export function meRoutes({ core, storage }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/profile', async (c) => c.json(await core.profiles.getProfile(c.get('userId'))))
    .patch('/profile', async (c) => {
      const input = parse(profileUpdateInput, await jsonBody(c));
      // Avatars must be files we issued for this user (no third-party URLs on public profiles).
      if (input.avatarUrl)
        await verifyUploadedImage(
          requireStorage(storage),
          input.avatarUrl,
          `avatars/${c.get('userId')}/`,
        );
      return c.json(await core.profiles.updateProfile(c.get('userId'), input));
    })
    .post('/avatar-upload', async (c) => {
      const s = requireStorage(storage);
      const { contentType } = parse(
        z.object({ contentType: z.enum(Object.keys(IMAGE_TYPES) as [ImageType]) }),
        await jsonBody(c),
      );
      const key = `avatars/${c.get('userId')}/${crypto.randomUUID()}.${IMAGE_TYPES[contentType]}`;
      return c.json(await s.createUpload(key, contentType));
    })
    .get('/activity', async (c) => {
      const q = parse(
        z.object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
          before: z.iso.datetime({ offset: true }).optional(),
        }),
        { limit: c.req.query('limit'), before: c.req.query('before') },
      );
      return c.json(await core.activity.list(c.get('userId'), q));
    })
    .get('/username-available', async (c) => {
      const u = parse(username, c.req.query('username') ?? '');
      return c.json({
        username: u,
        available: await core.profiles.isUsernameAvailable(u, c.get('userId')),
      });
    });
}
