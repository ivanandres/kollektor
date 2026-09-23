import { Hono } from 'hono';
import { z } from 'zod';
import { DomainError } from '@kollektor/core';
import { profileUpdateInput, username } from '@kollektor/schemas';
import { jsonBody, parse } from '../lib/http';
import type { AppDeps, AppEnv } from '../types';

const AVATAR_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;

export function meRoutes({ core, storage }: AppDeps) {
  return new Hono<AppEnv>()
    .get('/profile', async (c) => c.json(await core.profiles.getProfile(c.get('userId'))))
    .patch('/profile', async (c) => {
      const input = parse(profileUpdateInput, await jsonBody(c));
      // Avatars must be uploaded to our storage (no arbitrary third-party URLs on public profiles).
      if (input.avatarUrl && storage && !storage.isOwnPublicUrl(input.avatarUrl))
        throw new DomainError('VALIDATION', 'Subí la foto con /me/avatar-upload');
      return c.json(await core.profiles.updateProfile(c.get('userId'), input));
    })
    .post('/avatar-upload', async (c) => {
      if (!storage)
        throw new DomainError(
          'NOT_CONFIGURED',
          'El almacenamiento de imágenes no está configurado',
        );
      const { contentType } = parse(
        z.object({ contentType: z.enum(Object.keys(AVATAR_TYPES) as [keyof typeof AVATAR_TYPES]) }),
        await jsonBody(c),
      );
      const key = `avatars/${c.get('userId')}/${crypto.randomUUID()}.${AVATAR_TYPES[contentType]}`;
      return c.json(await storage.createUpload(key, contentType));
    })
    .get('/username-available', async (c) => {
      const u = parse(username, c.req.query('username') ?? '');
      return c.json({
        username: u,
        available: await core.profiles.isUsernameAvailable(u, c.get('userId')),
      });
    });
}
