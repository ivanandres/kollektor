import { serve } from '@hono/node-server';
import { bootstrap } from './bootstrap';
import { loadEnv } from './env';

const env = loadEnv();
const { app, close } = bootstrap(env);
const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Kollektor API listening on http://localhost:${info.port}/api`);
});

const shutdown = () => server.close(() => void close().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
