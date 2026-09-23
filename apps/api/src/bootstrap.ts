import { createCore } from '@kollektor/core';
import { createDb } from '@kollektor/db';
import { integrationsFromEnv } from '@kollektor/integrations';
import { createApp } from './app';
import { createAuth } from './auth';
import type { Env } from './env';

/** Composition root: env → adapters → core → auth → HTTP app. */
export function bootstrap(env: Env) {
  const { db, close } = createDb(env.DATABASE_URL);
  const { email, storage, ...adapters } = integrationsFromEnv(env);
  const core = createCore({
    db,
    ...adapters,
    config: { visionDailyLimit: env.VISION_DAILY_LIMIT },
  });
  const auth = createAuth({ db, core, email, env, storage });
  const app = createApp({ core, auth, env, storage });
  return { app, core, auth, close };
}
